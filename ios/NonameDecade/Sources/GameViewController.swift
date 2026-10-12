/*
 * 无名杀 iPad 移植 —— 游戏容器（WKWebView）
 * ==================================================================
 * 职责：
 *   1. 启动 127.0.0.1 本地 HTTP 服务（提供 Web 壳 + 游戏本体）
 *   2. 注入原生传输层 __nonameInvoke（WKUserScript, documentStart）
 *   3. 注册原生桥 WKScriptMessageHandler
 *   4. 以固定 iPad UA 加载页面，确保游戏走 iOS 代码分支 (lib.device = 'ios')
 */
import UIKit
import WebKit

final class GameViewController: UIViewController {

    private var server: LocalHTTPServer?
    private var bridge: NativeBridge?
    private var webView: WKWebView!
    private var statusBarHidden = true

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupWebView()
        startServerAndLoad(ports: Array(Paths.httpPort...(Paths.httpPort + 9)))
    }

    override var prefersStatusBarHidden: Bool { statusBarHidden }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .all }

    // MARK: - WebView

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        // 原生桥
        let bridge = NativeBridge(gameRoot: Paths.gameRoot)
        bridge.setStatusBarHandler { [weak self] show in
            self?.statusBarHidden = !show
            self?.setNeedsStatusBarAppearanceUpdate()
        }
        config.userContentController.add(bridge, name: NativeBridge.handlerName)
        self.bridge = bridge

        // 注入原生传输层（documentStart，先于任何页面脚本）
        if let url = Bundle.main.url(forResource: "__native", withExtension: "js", subdirectory: "Web"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            let script = WKUserScript(source: source,
                                      injectionTime: .atDocumentStart,
                                      forMainFrameOnly: false)
            config.userContentController.addUserScript(script)
        } else {
            NSLog("[noname] 警告：未找到 Web/__native.js，原生桥将不可用")
        }

        let webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
        webView.allowsBackForwardNavigationGestures = false
        // 固定 UA：确保 lib.device 判定为 ios
        webView.customUserAgent = "Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1"

        view.addSubview(webView)
        self.webView = webView
        bridge.webView = webView
    }

    // MARK: - 服务启动并加载

    private func startServerAndLoad(ports: [UInt16]) {
        guard let port = ports.first else {
            showFatal("无法启动本地服务：所有端口都被占用。请重启 App 或重启 iPad。")
            return
        }
        let server = LocalHTTPServer(port: port, webRoot: Paths.webRoot, gameRoot: Paths.gameRoot)
        server.onLog = { NSLog("[noname] %@", $0) }
        self.server = server

        server.start { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success:
                self.loadGame()
            case .failure:
                self.server?.stop()
                self.startServerAndLoad(ports: Array(ports.dropFirst()))
            }
        }
    }

    private func loadGame() {
        guard let url = URL(string: "http://127.0.0.1:\(server?.port ?? Paths.httpPort)/") else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        webView.load(request)
    }

    private func showFatal(_ message: String) {
        let alert = UIAlertController(title: "无名杀", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default))
        present(alert, animated: true)
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.handlerName)
        server?.stop()
    }
}

// MARK: - WKNavigationDelegate

extension GameViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("[noname] navigation failed: %@", error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("[noname] provisional navigation failed: %@", error.localizedDescription)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // 站外链接（例如更新说明）用系统浏览器打开
        if let url = navigationAction.request.url,
           navigationAction.navigationType == .linkActivated,
           url.host != "127.0.0.1" {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}
