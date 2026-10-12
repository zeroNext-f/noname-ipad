/*
 * 无名杀 iPad 移植 —— 原生桥
 * ==================================================================
 * 桌面端这套桥走 HTTP 的 __bridge 接口，iOS 端改走 WKScriptMessageHandler，
 * 但「方法名 + 参数 + 返回结构」完全一致，因此垫片 JS 无需改动。
 */
import Foundation
import WebKit

final class NativeBridge: NSObject, WKScriptMessageHandler {

    static let handlerName = "nonameNative"

    weak var webView: WKWebView?
    private let gameRoot: URL
    private var didNotifyStatusBar: ((Bool) -> Void)?

    init(gameRoot: URL) {
        self.gameRoot = gameRoot
        super.init()
    }

    func setStatusBarHandler(_ handler: @escaping (Bool) -> Void) {
        didNotifyStatusBar = handler
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let method = body["method"] as? String else { return }
        let args = body["args"] as? [String: Any] ?? [:]

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            self.handle(method: method, args: args) { result in
                DispatchQueue.main.async {
                    self.reply(id: id, result: result)
                }
            }
        }
    }

    private func reply(id: String, result: Any) {
        guard let webView = webView else { return }
        let json: String
        if JSONSerialization.isValidJSONObject(result),
           let data = try? JSONSerialization.data(withJSONObject: result, options: []),
           let s = String(data: data, encoding: .utf8) {
            json = s
        } else if let s = result as? String {
            json = "{\"raw\":" + Self.jsStringLiteral(s) + "}"
        } else {
            json = "{}"
        }
        let js = "window.__nonameNativeReply(\(Self.jsStringLiteral(id)), \(Self.jsStringLiteral(json)));"
        DispatchQueue.main.async {
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // MARK: - 分发

    private func handle(method: String, args: [String: Any], done: @escaping (Any) -> Void) {
        switch method {

        case "gamePath":
            done(["url": Paths.assetURLString])

        case "stat":
            done(stat(rel: args["p"] as? String))

        case "readFile":
            done(readFile(rel: args["p"] as? String, encoding: args["encoding"] as? String))

        case "writeFile":
            done(writeFile(rel: args["p"] as? String,
                           base64: args["base64"] as? String,
                           text: args["text"] as? String))

        case "list":
            done(list(rel: args["p"] as? String))

        case "mkdir":
            done(mkdir(rel: args["p"] as? String))

        case "remove":
            done(remove(rel: args["p"] as? String))

        case "download":
            if let urlString = args["url"] as? String, let rel = args["p"] as? String {
                download(urlString: urlString, rel: rel, done: done)
            } else {
                done(["__error": "download: missing url/p"])
            }

        case "statusBar":
            let show = (args["show"] as? Bool) ?? true
            DispatchQueue.main.async { self.didNotifyStatusBar?(show) }
            done(["ok": true])

        case "exitApp":
            done(["ok": true])

        // 存档导入：让游戏走全新存档（与桌面验证一致）
        case "importGameData":
            done(["hasData": false])

        // 扩展管理：先保证接口完整（详见 docs：扩展市场由游戏内 UI 提供）
        case "getExtensions":
            done(["value": NSNull()])
        case "enableExtension", "addExtension", "removeExtension", "getExtensionState":
            done(["ok": true])
        case "plugin":
            done(["__error": "native plugin bridge not implemented"])

        default:
            done(["__error": "unknown bridge method: \(method)"])
        }
    }

    // MARK: - 路径安全

    /// 把相对路径安全地映射到游戏根目录下；拒绝任何越界
    private func resolve(_ rel: String?) -> URL? {
        let cleaned = (rel ?? "").replacingOccurrences(of: "\\", with: "/")
        let comps = cleaned.split(separator: "/").map(String.init)
        guard !comps.contains("..") else { return nil }
        return comps.reduce(gameRoot) { $0.appendingPathComponent($1) }
    }

    // MARK: - 各方法实现

    private func stat(rel: String?) -> [String: Any] {
        guard let url = resolve(rel) else { return ["exists": false] }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else {
            return ["exists": false]
        }
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        let size = (attrs?[.size] as? NSNumber)?.intValue ?? 0
        let mtime = (attrs?[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        return [
            "exists": true,
            "isDirectory": isDir.boolValue,
            "isFile": !isDir.boolValue,
            "size": size,
            "mtime": mtime
        ]
    }

    private func readFile(rel: String?, encoding: String?) -> [String: Any] {
        guard let url = resolve(rel) else { return ["__error": "bad path"] }
        guard let data = try? Data(contentsOf: url) else {
            return ["__error": "readFile failed: \(rel ?? "")"]
        }
        if encoding == "utf-8" || encoding == "utf8" {
            return ["text": String(data: data, encoding: .utf8) ?? ""]
        }
        return ["base64": data.base64EncodedString()]
    }

    private func writeFile(rel: String?, base64: String?, text: String?) -> [String: Any] {
        guard let url = resolve(rel) else { return ["__error": "bad path"] }
        let dir = url.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let data: Data
        if let text = text {
            data = Data(text.utf8)
        } else {
            data = Data(base64Encoded: base64 ?? "") ?? Data()
        }
        do {
            try data.write(to: url, options: .atomic)
            return ["ok": true, "size": data.count]
        } catch {
            return ["__error": "writeFile failed: \(error.localizedDescription)"]
        }
    }

    private func list(rel: String?) -> [String: Any] {
        guard let url = resolve(rel) else { return ["folders": [], "files": []] }
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: url.path) else {
            return ["folders": [], "files": []]
        }
        var folders: [String] = []
        var files: [String] = []
        for name in names {
            if name.hasPrefix(".") || name.hasPrefix("_") { continue }
            var isDir: ObjCBool = false
            let full = url.appendingPathComponent(name).path
            if FileManager.default.fileExists(atPath: full, isDirectory: &isDir) {
                if isDir.boolValue { folders.append(name) } else { files.append(name) }
            }
        }
        folders.sort(); files.sort()
        return ["folders": folders, "files": files]
    }

    private func mkdir(rel: String?) -> [String: Any] {
        guard let url = resolve(rel) else { return ["__error": "bad path"] }
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            return ["ok": true]
        } catch {
            return ["__error": "mkdir failed: \(error.localizedDescription)"]
        }
    }

    private func remove(rel: String?) -> [String: Any] {
        guard let url = resolve(rel) else { return ["__error": "bad path"] }
        do {
            try FileManager.default.removeItem(at: url)
            return ["ok": true]
        } catch {
            return ["__error": "remove failed: \(error.localizedDescription)"]
        }
    }

    private func download(urlString: String, rel: String, done: @escaping (Any) -> Void) {
        guard let url = resolve(rel), let remote = URL(string: urlString) else {
            done(["__error": "download: bad url/path"]); return
        }
        var request = URLRequest(url: remote)
        request.setValue("AppleWebkit", forHTTPHeaderField: "User-Agent")
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                done(["__error": "download failed: \(error.localizedDescription)"]); return
            }
            guard let data = data else {
                done(["__error": "download: empty body"]); return
            }
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                done(["__error": "download HTTP \(http.statusCode)"]); return
            }
            let dir = url.deletingLastPathComponent()
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            do {
                try data.write(to: url, options: .atomic)
                done(["ok": true, "size": data.count])
            } catch {
                done(["__error": "download write failed: \(error.localizedDescription)"])
            }
        }
        task.resume()
    }

    // MARK: - JS 字符串转义

    /// 生成安全的 JS 字符串字面量（非 ASCII 转义为 \\uXXXX，避免任何编码问题）
    static func jsStringLiteral(_ s: String) -> String {
        var out = "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            case "\u{2028}": out += "\\u2028"
            case "\u{2029}": out += "\\u2029"
            default:
                if scalar.value < 0x20 || scalar.value > 0x7E {
                    if scalar.value > 0xFFFF {
                        out += String(format: "\\u{%X}", scalar.value)
                    } else {
                        out += String(format: "\\u%04X", scalar.value)
                    }
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
        return out
    }
}
