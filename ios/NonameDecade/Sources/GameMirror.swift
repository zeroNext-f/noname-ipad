/*
 * 无名杀 iPad 移植 —— 游戏数据镜像（局域网同步）
 * ==================================================================
 * 为什么不用压缩包：
 *   游戏数据约 2.5 GB / 2.5 万个文件。相比传输一个巨型 zip 再在设备上解压
 *   （iOS 无内置 zip 解压 API，且 2.5 GB 一次性解压内存/中断风险高），
 *   直接把 PC 上已经解压好的游戏目录「逐文件镜像」到沙盒更简单、可续传、
 *   可显示进度、且天然规避解压环节。
 *
 * PC 侧由 tools/share.js 提供：
 *   GET /__manifest  -> { version, files:[{p,size}], dirs:[...] }
 *   GET /<相对路径>   -> 文件内容
 *
 * 同步策略：按 (相对路径, 文件大小) 比对，已存在且大小一致的直接跳过，
 *           因此中断后再次运行即可续传。
 */
import Foundation

final class GameMirror {

    struct Entry: Codable {
        let p: String
        let size: Int
    }

    struct Manifest: Codable {
        let version: String?
        let files: [Entry]
        let dirs: [String]?
    }

    enum MirrorError: LocalizedError {
        case badURL
        case badManifest
        case http(Int)
        case cancelled

        var errorDescription: String? {
            switch self {
            case .badURL: return "服务器地址无效"
            case .badManifest: return "无法解析服务器返回的清单（/__manifest）"
            case .http(let code): return "服务器返回 HTTP \(code)"
            case .cancelled: return "已取消"
            }
        }
    }

    private let gameRoot: URL
    private let session: URLSession
    private let lock = NSLock()
    private var cancelled = false
    private var nextIndex = 0
    private var downloaded = 0
    private var skipped = 0
    private var failed: [String] = []

    static let maxConcurrent = 8

    init(gameRoot: URL) {
        self.gameRoot = gameRoot
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.timeoutIntervalForResource = 300
        cfg.httpMaximumConnectionsPerHost = GameMirror.maxConcurrent
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: cfg)
    }

    // MARK: - 清单

    func fetchManifest(base: URL, completion: @escaping (Result<Manifest, Error>) -> Void) {
        guard let url = URL(string: "__manifest", relativeTo: base) else {
            completion(.failure(MirrorError.badURL)); return
        }
        session.dataTask(with: url) { data, response, error in
            if let error = error { completion(.failure(error)); return }
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                completion(.failure(MirrorError.http(http.statusCode))); return
            }
            guard let data = data,
                  let manifest = try? JSONDecoder().decode(Manifest.self, from: data) else {
                completion(.failure(MirrorError.badManifest)); return
            }
            completion(.success(manifest))
        }.resume()
    }

    // MARK: - 同步

    func cancel() {
        lock.lock(); cancelled = true; lock.unlock()
        session.invalidateAndCancel()
    }

    private var isCancelled: Bool {
        lock.lock(); defer { lock.unlock() }
        return cancelled
    }

    /// progress(current, total, 当前文件)
    func sync(base: URL,
              manifest: Manifest,
              progress: @escaping (Int, Int, String) -> Void,
              completion: @escaping (Result<(Int, Int), Error>) -> Void) {

        let files = manifest.files
        let total = files.count
        if let dirs = manifest.dirs {
            for d in dirs {
                let url = dirs.reduce(gameRoot) { $0.appendingPathComponent(d) }
                try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            }
        }

        let group = DispatchGroup()
        for _ in 0..<GameMirror.maxConcurrent {
            group.enter()
            DispatchQueue.global(qos: .utility).async { [weak self] in
                self?.worker(base: base, files: files, total: total, progress: progress)
                group.leave()
            }
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            if self.isCancelled { completion(.failure(MirrorError.cancelled)); return }
            if !self.failed.isEmpty {
                completion(.failure(NSError(domain: "noname", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: "有 \(self.failed.count) 个文件下载失败，请重新运行以续传"
                ])))
                return
            }
            completion(.success((self.downloaded, self.skipped)))
        }
    }

    private func worker(base: URL, files: [Entry], total: Int,
                        progress: @escaping (Int, Int, String) -> Void) {
        while true {
            if isCancelled { return }
            lock.lock()
            let i = nextIndex
            nextIndex += 1
            lock.unlock()
            guard i < files.count else { return }
            let entry = files[i]
            if entry.size > 0 && shouldSkip(entry) {
                lock.lock(); skipped += 1; let done = skipped + downloaded; lock.unlock()
                progress(done, total, entry.p)
            } else {
                switch download(base: base, entry: entry) {
                case .success:
                    lock.lock(); downloaded += 1; let done = skipped + downloaded; lock.unlock()
                    progress(done, total, entry.p)
                case .failure:
                    lock.lock(); failed.append(entry.p); lock.unlock()
                }
            }
        }
    }

    private func localURL(_ rel: String) -> URL {
        rel.split(separator: "/").reduce(gameRoot) { $0.appendingPathComponent(String($1)) }
    }

    private func shouldSkip(_ entry: Entry) -> Bool {
        let url = localURL(entry.p)
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = (attrs[.size] as? NSNumber)?.intValue else { return false }
        // 大小为 0 的文件（目录占位等）按存在即可
        return entry.size == 0 ? true : size == entry.size
    }

    private func download(base: URL, entry: Entry) -> Result<Void, Error> {
        let dst = localURL(entry.p)
        try? FileManager.default.createDirectory(at: dst.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        // 路径可能含中文/空格/特殊字符，必须先做百分号编码，否则 URL(string:) 可能返回 nil
        guard let encoded = entry.p.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: encoded, relativeTo: base) else {
            return .failure(MirrorError.badURL)
        }
        var request = URLRequest(url: url)
        request.setValue("noname-mirror/1.0", forHTTPHeaderField: "User-Agent")

        let sem = DispatchSemaphore(value: 0)
        var result: Result<Void, Error> = .failure(MirrorError.http(0))

        session.dataTask(with: request) { data, response, error in
            defer { sem.signal() }
            if let error = error { result = .failure(error); return }
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                result = .failure(MirrorError.http(http.statusCode)); return
            }
            guard let data = data else { result = .failure(MirrorError.http(0)); return }
            do {
                try data.write(to: dst, options: .atomic)
                result = .success(())
            } catch {
                result = .failure(error)
            }
        }.resume()

        sem.wait()
        return result
    }
}
