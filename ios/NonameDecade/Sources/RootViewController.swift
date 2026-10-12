/*
 * 无名杀 iPad 移植 —— 根控制器
 * 首次启动若无游戏数据，进入「数据镜像」引导页；否则直接进入游戏。
 */
import UIKit

final class RootViewController: UIViewController {

    private var child: UIViewController?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        if Paths.isGameInstalled() {
            showGame()
        } else {
            showInstaller()
        }
    }

    private func setChild(_ vc: UIViewController) {
        child?.willMove(toParent: nil)
        child?.view.removeFromSuperview()
        child?.removeFromParent()

        addChild(vc)
        vc.view.frame = view.bounds
        vc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(vc.view)
        vc.didMove(toParent: self)
        child = vc
    }

    private func showGame() {
        setChild(GameViewController())
    }

    private func showInstaller() {
        let installer = InstallerViewController()
        installer.onFinished = { [weak self] in
            guard let self = self else { return }
            UIView.transition(with: self.view, duration: 0.3, options: .transitionCrossDissolve) {
                self.showGame()
            }
        }
        setChild(installer)
    }
}
