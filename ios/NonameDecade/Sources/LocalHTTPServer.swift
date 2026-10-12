/*
 * 无名杀 iPad 移植 —— App 内嵌本地 HTTP 服务
 * ==================================================================
 * 为什么需要它：
 *   游戏通过 lib.assetURL 前缀加载 <script> / <img> / <audio> / <font> / XHR，
 *   并且依赖 localStorage + IndexedDB 存档。
 *   在 WKWebView 里：
 *     - file:// 子资源受限、XHR 被禁、且 file:// 源的持久化存储不可靠；
 *     - 自定义 scheme 的存储行为在各 iOS 版本上不一致。
 *   用 http://127.0.0.1:<port>/ 是最稳的做法：同源、可 XHR、存储正常。
 *
 * 路由规则（与桌面验证服务器一致）：
 *   /               -> Bundle 内 Web/index.html
 *   /__shim.js      -> Bundle 内 Web/__shim.js
 *   /js /css /img /cordova.js 等 -> Bundle 内 Web/*
 *   /game /image /audio ...      -> Documents/noname/*
 *
 * 只监听 127.0.0.1（loopback），不对外暴露。
 */
import Foundation
import Network

final class LocalHTTPServer {

    private(set) var port: UInt16
    private let webRoot: URL?
    private let gameRoot: URL
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "online.nonamekill.http", attributes: .concurrent)

    private(set) var isRunning = false
    var onLog: ((String) -> Void)?
    private var startCompletion: ((Result<UInt16, Error>) -> Void)?

    init(port: UInt16, webRoot: URL?, gameRoot: URL) {
        self.port = port
        self.webRoot = webRoot
        self.gameRoot = gameRoot
    }

    // MARK: - 生命周期

    /// 启动；成功/失败通过 completion 回调（端口被占用会以 failure 返回，便于换端口重试）
    func start(completion: @escaping (Result<UInt16, Error>) -> Void) {
        guard listener == nil else { completion(.success(port)); return }
        self.startCompletion = completion

        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        params.acceptLocalOnly = true

        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            completion(.failure(NSError(domain: "noname", code: 1,
                                        userInfo: [NSLocalizedDescriptionKey: "非法端口 \(port)"])))
            return
        }

        let l: NWListener
        do {
            l = try NWListener(using: params, on: nwPort)
        } catch {
            completion(.failure(error))
            return
        }

        l.newConnectionHandler = { [weak self] conn in
            self?.handle(conn)
        }
        l.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            let done = self.startCompletion
            switch state {
            case .ready:
                self.isRunning = true
                self.onLog?("http server ready on 127.0.0.1:\(self.port)")
                self.startCompletion = nil
                done?(.success(self.port))
            case .failed(let err):
                self.isRunning = false
                self.onLog?("http server failed: \(err)")
                self.listener?.cancel()
                self.listener = nil
                self.startCompletion = nil
                done?(.failure(err))
            default:
                break
            }
        }
        l.start(queue: queue)
        listener = l
    }

    func stop() {
        listener?.cancel()
        listener = nil
        isRunning = false
    }

    // MARK: - 连接处理

    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        var buffer = Data()
        func readMore() {
            conn.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
                guard let self = self else { conn.cancel(); return }
                if let data = data, !data.isEmpty {
                    buffer.append(data)
                    if let headEnd = buffer.range(of: Data("\r\n\r\n".utf8)) {
                        let head = buffer.subdata(in: 0..<headEnd.lowerBound)
                        self.respond(to: head, on: conn)
                        return
                    }
                    if buffer.count > 256 * 1024 {
                        self.sendError(conn, 431, "Request Header Fields Too Large")
                        return
                    }
                    readMore()
                } else if isComplete || error != nil {
                    conn.cancel()
                } else {
                    readMore()
                }
            }
        }
        readMore()
    }

    // MARK: - 请求解析

    private struct Request {
        var method = "GET"
        var path = "/"
        var rangeStart: Int?
        var rangeEnd: Int?
        var keepAlive = false
    }

    private func parse(_ head: Data) -> Request? {
        guard let text = String(data: head, encoding: .utf8) else { return nil }
        let lines = text.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else { return nil }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else { return nil }

        var req = Request()
        req.method = String(parts[0]).uppercased()
        let rawPath = String(parts[1])
        req.path = rawPath.components(separatedBy: "?").first ?? rawPath
        if req.path.isEmpty { req.path = "/" }

        for line in lines.dropFirst() {
            guard let idx = line.firstIndex(of: ":") else { continue }
            let key = line[line.startIndex..<idx].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: idx)...].trimmingCharacters(in: .whitespaces)
            if key == "range", let r = Self.parseRange(value) {
                req.rangeStart = r.0
                req.rangeEnd = r.1
            } else if key == "connection" {
                req.keepAlive = value.lowercased().contains("keep-alive")
            }
        }
        return req
    }

    /// "bytes=0-1023" / "bytes=500-" -> (500, nil) 等
    private static func parseRange(_ value: String) -> (Int, Int?)? {
        guard value.hasPrefix("bytes=") else { return nil }
        let spec = value.dropFirst("bytes=".count).components(separatedBy: ",").first ?? ""
        let pair = spec.split(separator: "-", omittingEmptySubsequences: false)
        guard pair.count == 2 else { return nil }
        let startStr = pair[0].trimmingCharacters(in: .whitespaces)
        let endStr = pair[1].trimmingCharacters(in: .whitespaces)
        if startStr.isEmpty {
            guard let suffix = Int(endStr) else { return nil }
            return (-suffix, nil)   // 后缀范围，调用方处理
        }
        guard let start = Int(startStr) else { return nil }
        return (start, endStr.isEmpty ? nil : Int(endStr))
    }

    // MARK: - 路由

    private func resolve(_ path: String) -> URL? {
        // URL 解码（中文文件名 / %20 等）
        let decoded = path.removingPercentEncoding ?? path
        let comps = decoded.split(separator: "/").map(String.init)
        guard !comps.contains("..") else { return nil }   // 阻止目录穿越

        // 1) Web 壳优先（index/html/js/css/img/cordova.js/__shim.js/__native.js）
        if let webRoot = webRoot {
            let candidate = comps.reduce(webRoot) { $0.appendingPathComponent($1) }
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDir), !isDir.boolValue {
                return candidate
            }
        }
        // 2) 根路径 -> Web/index.html
        if comps.isEmpty, let webRoot = webRoot {
            let idx = webRoot.appendingPathComponent("index.html")
            if FileManager.default.fileExists(atPath: idx.path) { return idx }
        }
        // 3) 游戏本体目录
        let game = comps.reduce(gameRoot) { $0.appendingPathComponent($1) }
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: game.path, isDirectory: &isDir), !isDir.boolValue {
            return game
        }
        return nil
    }

    private func respond(to head: Data, on conn: NWConnection) {
        guard let req = parse(head) else {
            sendError(conn, 400, "Bad Request"); return
        }
        guard req.method == "GET" || req.method == "HEAD" else {
            sendError(conn, 405, "Method Not Allowed"); return
        }
        guard let fileURL = resolve(req.path) else {
            sendError(conn, 404, "Not Found"); return
        }
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
              let total = (attrs[.size] as? NSNumber)?.intValue else {
            sendError(conn, 404, "Not Found"); return
        }

        let type = Self.mimeType(fileURL.pathExtension)
        var status = "200 OK"
        var offset = 0
        var length = total
        var extraHeaders: [String: String] = [
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
            "Content-Type": type
        ]

        if let rs = req.rangeStart {
            var start = rs
            if start < 0 { start = max(0, total + start) }   // 后缀范围
            guard start < total else {
                send(conn, "416 Range Not Satisfiable",
                     ["Content-Range": "bytes */\(total)", "Content-Length": "0"], body: nil)
                return
            }
            var end = req.rangeEnd ?? (total - 1)
            end = min(end, total - 1)
            offset = start
            length = end - start + 1
            status = "206 Partial Content"
            extraHeaders["Content-Range"] = "bytes \(start)-\(end)/\(total)"
        }

        extraHeaders["Content-Length"] = "\(length)"
        if length == 0 || req.method == "HEAD" {
            send(conn, status, extraHeaders, body: nil)
            return
        }
        streamFile(fileURL, offset: offset, length: length, status: status,
                   headers: extraHeaders, on: conn)
    }

    // MARK: - 响应发送

    private func send(_ conn: NWConnection, _ status: String,
                      _ headers: [String: String], body: Data?) {
        var head = "HTTP/1.1 \(status)\r\n"
        var h = headers
        h["Connection"] = "close"
        for (k, v) in h { head += "\(k): \(v)\r\n" }
        head += "\r\n"
        var payload = Data(head.utf8)
        if let body = body { payload.append(body) }
        conn.send(content: payload, completion: .contentProcessed { _ in
            conn.cancel()
        })
    }

    private func sendError(_ conn: NWConnection, _ code: Int, _ text: String) {
        let body = Data("<html><body><h1>\(code) \(text)</h1></body></html>".utf8)
        send(conn, "\(code) \(text)",
             ["Content-Type": "text/html; charset=utf-8",
              "Content-Length": "\(body.count)"],
             body: body)
    }

    private func streamFile(_ url: URL, offset: Int, length: Int,
                            status: String, headers: [String: String],
                            on conn: NWConnection) {
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            sendError(conn, 500, "Open Failed"); return
        }
        var head = "HTTP/1.1 \(status)\r\n"
        var h = headers
        h["Connection"] = "close"
        for (k, v) in h { head += "\(k): \(v)\r\n" }
        head += "\r\n"

        let chunkSize = 256 * 1024
        var remaining = length

        func pump() {
            if remaining <= 0 {
                try? handle.close()
                conn.cancel()
                return
            }
            let want = min(chunkSize, remaining)
            let chunk: Data?
            do { chunk = try handle.read(upToCount: want) } catch { chunk = nil }
            guard let data = chunk, !data.isEmpty else {
                try? handle.close()
                conn.cancel()
                return
            }
            remaining -= data.count
            conn.send(content: data, completion: .contentProcessed { error in
                if error != nil {
                    try? handle.close()
                    conn.cancel()
                    return
                }
                pump()
            })
        }

        conn.send(content: Data(head.utf8), completion: .contentProcessed { [weak self] error in
            guard self != nil, error == nil else {
                try? handle.close(); conn.cancel(); return
            }
            if offset > 0 { try? handle.seek(toOffset: UInt64(offset)) }
            pump()
        })
    }

    // MARK: - MIME

    static func mimeType(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "txt", "md": return "text/plain; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "bmp": return "image/bmp"
        case "mp3": return "audio/mpeg"
        case "ogg": return "audio/ogg"
        case "wav": return "audio/wav"
        case "m4a": return "audio/mp4"
        case "mp4": return "video/mp4"
        case "webm": return "video/webm"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "zip": return "application/zip"
        default: return "application/octet-stream"
        }
    }
}
