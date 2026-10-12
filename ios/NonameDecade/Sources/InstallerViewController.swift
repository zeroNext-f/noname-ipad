/*
 * 无名杀 iPad 移植 —— 首次数据同步引导页
 * ==================================================================
 * 游戏本体约 2.5 GB / 2.5 万个文件，不随 IPA 分发。
 * 首次启动时，从同一局域网内的电脑把已解压好的游戏目录镜像到本机沙盒。
 * 电脑端运行：node tools/share.js
 */
import UIKit

final class InstallerViewController: UIViewController {

    var onFinished: (() -> Void)?

    private let scroll = UIScrollView()
    private let content = UIView()
    private let titleLabel = UILabel()
    private let descLabel = UILabel()
    private let urlField = UITextField()
    private let startButton = UIButton(type: .system)
    private let progress = UIProgressView(progressViewStyle: .default)
    private let statusLabel = UILabel()
    private let logView = UITextView()

    private var mirror: GameMirror?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.08, green: 0.09, blue: 0.11, alpha: 1)
        buildUI()
    }

    override var prefersStatusBarHidden: Bool { false }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // MARK: - UI

    private func buildUI() {
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            content.topAnchor.constraint(equalTo: scroll.topAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: scroll.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: scroll.bottomAnchor),
            content.widthAnchor.constraint(equalTo: scroll.widthAnchor)
        ])

        titleLabel.text = "无名杀十周年版 · iPad"
        titleLabel.font = .systemFont(ofSize: 26, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center

        descLabel.numberOfLines = 0
        descLabel.font = .systemFont(ofSize: 15)
        descLabel.textColor = UIColor(white: 0.82, alpha: 1)
        descLabel.text = """
        游戏数据尚未导入。

        请在你的电脑上：
          1. 打开「无名杀 iPad 移植」文件夹
          2. 运行命令：node tools/share.js
          3. 记下它打印的局域网地址（形如 http://192.168.x.x:8124/）
          4. 确保 iPad 与电脑连同一个 Wi-Fi
          5. 把地址填到下面，点击「开始同步」

        首次同步约 2.5 GB，视网速需要十几分钟。
        中途可随时退出，再次点击「开始同步」会自动续传。
        """

        urlField.placeholder = "http://192.168.1.100:8124/"
        urlField.text = "http://192.168.1.100:8124/"
        urlField.borderStyle = .roundedRect
        urlField.keyboardType = .URL
        urlField.autocapitalizationType = .none
        urlField.autocorrectionType = .no
        urlField.returnKeyType = .go
        urlField.clearButtonMode = .whileEditing
        urlField.delegate = self

        startButton.setTitle("开始同步", for: .normal)
        startButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        startButton.backgroundColor = UIColor(red: 0.20, green: 0.48, blue: 0.90, alpha: 1)
        startButton.setTitleColor(.white, for: .normal)
        startButton.layer.cornerRadius = 10
        startButton.addTarget(self, action: #selector(startTapped), for: .touchUpInside)

        progress.progress = 0

        statusLabel.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        statusLabel.textColor = UIColor(white: 0.72, alpha: 1)
        statusLabel.numberOfLines = 2

        logView.backgroundColor = UIColor(white: 0.13, alpha: 1)
        logView.textColor = UIColor(white: 0.8, alpha: 1)
        logView.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        logView.isEditable = false
        logView.layer.cornerRadius = 8
        logView.text = ""

        let allViews: [UIView] = [titleLabel, descLabel, urlField, startButton, progress, statusLabel, logView]
        for v in allViews {
            v.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(v)
        }

        let m: CGFloat = 20
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: content.topAnchor, constant: 34),
            titleLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: m),
            titleLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -m),

            descLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 18),
            descLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: m),
            descLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -m),

            urlField.topAnchor.constraint(equalTo: descLabel.bottomAnchor, constant: 20),
            urlField.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: m),
            urlField.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -m),
            urlField.heightAnchor.constraint(equalToConstant: 44),

            startButton.topAnchor.constraint(equalTo: urlField.bottomAnchor, constant: 14),
            startButton.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: m),
            startButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -m),
            startButton.heightAnchor.constraint(equalToConstant: 50),

            progress.topAnchor.constraint(equalTo: startButton.bottomAnchor, constant: 22),
            progress.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: m),
            progress.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -m),

            statusLabel.topAnchor.constraint(equalTo: progress.bottomAnchor, constant: 8),
            statusLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: m),
            statusLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -m),

            logView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 14),
            logView.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: m),
            logView.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -m),
            logView.heightAnchor.constraint(equalToConstant: 220),
            logView.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -30)
        ])
    }

    // MARK: - 同步

    @objc private func startTapped() {
        view.endEditing(true)
        guard let base = normalizedURL() else {
            appendLog("地址无效：\(urlField.text ?? "")")
            return
        }
        startButton.isEnabled = false
        startButton.alpha = 0.5
        progress.progress = 0
        appendLog("连接 \(base.absoluteString) …")

        let mirror = GameMirror(gameRoot: Paths.gameRoot)
        self.mirror = mirror

        mirror.fetchManifest(base: base) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                self.appendLog("获取清单失败：\(error.localizedDescription)")
                self.finishWithError()
            case .success(let manifest):
                self.appendLog("清单获取成功，共 \(manifest.files.count) 个文件，开始同步…")
                Paths.ensureGameRoot()
                mirror.sync(base: base, manifest: manifest, progress: { done, total, path in
                    DispatchQueue.main.async {
                        let p = total > 0 ? Float(done) / Float(total) : 0
                        self.progress.progress = p
                        self.statusLabel.text = String(format: "%d / %d  (%.1f%%)", done, total, p * 100)
                        if done % 400 == 0 { self.appendLog(path) }
                    }
                }, completion: { result in
                    DispatchQueue.main.async {
                        switch result {
                        case .success(let tuple):
                            self.appendLog("同步完成：新下载 \(tuple.0) 个，跳过 \(tuple.1) 个。")
                            self.progress.progress = 1
                            self.onFinished?()
                        case .failure(let error):
                            self.appendLog("同步中断：\(error.localizedDescription)")
                            self.finishWithError()
                        }
                    }
                })
            }
        }
    }

    private func finishWithError() {
        // 这个函数可能从 URLSession 的后台回调里被调用，必须切回主线程改 UI
        DispatchQueue.main.async {
            self.startButton.isEnabled = true
            self.startButton.alpha = 1
        }
    }

    private func normalizedURL() -> URL? {
        var s = (urlField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") {
            s = "http://" + s
        }
        if !s.hasSuffix("/") { s += "/" }
        return URL(string: s)
    }

    private func appendLog(_ line: String) {
        DispatchQueue.main.async {
            self.logView.text = (self.logView.text ?? "") + line + "\n"
            let bottom = NSRange(location: (self.logView.text as NSString).length, length: 0)
            self.logView.scrollRangeToVisible(bottom)
        }
    }
}

extension InstallerViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        startTapped()
        return true
    }
}
