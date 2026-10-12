/*
 * 无名杀 iPad 移植 —— 路径与常量
 */
import Foundation

enum Paths {

    /// 应用沙盒 Documents
    static var documents: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    /// 游戏根目录（网页根）：Documents/noname
    static var gameRoot: URL {
        documents.appendingPathComponent("noname", isDirectory: true)
    }

    /// Bundle 内嵌 Web 壳：Web/
    static var webRoot: URL? {
        Bundle.main.url(forResource: "Web", withExtension: nil)
    }

    /// 运行时本地 HTTP 端口（固定，保证 lib.assetURL 在多次启动间稳定）
    static let httpPort: UInt16 = 26789

    /// 运行时游戏根 URL（写入 localStorage.noname_inited）
    static var assetURLString: String { "http://127.0.0.1:\(httpPort)/" }

    /// 判定游戏数据是否已就绪
    static func isGameInstalled() -> Bool {
        let marker = gameRoot.appendingPathComponent("game/game.js")
        return FileManager.default.fileExists(atPath: marker.path)
    }

    static func ensureGameRoot() {
        try? FileManager.default.createDirectory(at: gameRoot, withIntermediateDirectories: true)
    }
}
