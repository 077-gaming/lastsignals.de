import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = .black
        window?.rootViewController = ShellViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// LAST SIGNALS: Hülle um den Capacitor-WebView.
/// Querformat, Vollbild ohne Status-Leiste, Home-Strich blendet sich aus, Randgesten brauchen zwei Wischer
/// (keine versehentlichen Systemgesten im Kampf). Der WebView liegt innerhalb der sicheren Bereiche:
/// Notch/Dynamic Island und Home-Strich verdecken nie das HUD, die Ränder bleiben schwarz.
final class ShellViewController: UIViewController {
    private let bridgeController = CAPBridgeViewController()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        addChild(bridgeController)
        let web = bridgeController.view!
        web.translatesAutoresizingMaskIntoConstraints = false
        web.backgroundColor = .black
        view.addSubview(web)
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
            web.topAnchor.constraint(equalTo: guide.topAnchor),
            web.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
        ])
        bridgeController.didMove(toParent: self)
        bridgeController.webView?.isOpaque = false
        bridgeController.webView?.backgroundColor = .black
        bridgeController.webView?.scrollView.backgroundColor = .black
        bridgeController.webView?.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        startTestHookIfRequested()
        #endif
    }

    #if DEBUG
    /// Nur Debug-Build (Simulator-Test, Apps/tests/ios.mjs): Start mit `-lsTestJS <datei> -lsTestOut <datei>` führt das
    /// Prüfskript im Spiel aus und schreibt window.__lsTestResult als JSON in die Ausgabedatei. Im Release-Build fehlt das.
    private func startTestHookIfRequested() {
        let defaults = UserDefaults.standard
        guard let scriptPath = defaults.string(forKey: "lsTestJS"), let outPath = defaults.string(forKey: "lsTestOut"),
              let script = try? String(contentsOfFile: scriptPath, encoding: .utf8) else { return }
        var injected = false
        var ticks = 0
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] timer in
            guard let web = self?.bridgeController.webView else { return }
            ticks += 1
            if ticks > 240 { timer.invalidate(); return }
            if !injected {
                // erst wenn das Spiel geladen ist (nicht about:blank vor dem Start der Capacitor-Seite)
                web.evaluateJavaScript("(location.protocol !== 'about:' && document.readyState === 'complete' && !!document.getElementById('screens')) ? 'bereit' : ''") { value, _ in
                    guard (value as? String) == "bereit", !injected else { return }
                    injected = true
                    web.evaluateJavaScript(script, completionHandler: nil)
                }
                return
            }
            web.evaluateJavaScript("window.__lsTestResult ? JSON.stringify(window.__lsTestResult) : ''") { value, _ in
                guard let json = value as? String, !json.isEmpty else { return }
                let done = json.contains("\"fertig\":true")
                try? json.write(toFile: outPath, atomically: true, encoding: .utf8)
                if done { timer.invalidate() }
            }
        }
    }
    #endif

    override var prefersStatusBarHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }
    override var childForStatusBarHidden: UIViewController? { nil }
    override var childForHomeIndicatorAutoHidden: UIViewController? { nil }
    override var childForScreenEdgesDeferringSystemGestures: UIViewController? { nil }
}
