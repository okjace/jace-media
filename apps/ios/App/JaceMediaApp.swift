import AVFoundation
import SwiftUI
import WebKit

/// Jace Media for iPhone and iPad, all native SwiftUI on Jace Media's app API,
/// with Liquid Glass on iOS 26. Videos (YouTube's too) play in Jace Media's own
/// player. Only going live uses the site, full screen, because it needs the camera
/// through the browser engine.
@main
struct JaceMediaApp: App {
    @StateObject private var session = SessionStore()

    init() {
        // Videos keep their sound when the phone is on silent, and can keep playing in picture-in-picture.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .preferredColorScheme(.dark)
                .tint(jaceGreen)
                .task {
                    await session.loadMe()
                    await session.loadFollowing()
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var session: SessionStore
    @State private var checkedUpdates = false

    var body: some View {
        tabs
            .background(jaceBackground)
            .onAppear {
                guard !checkedUpdates, Updates.automatic else { return }
                checkedUpdates = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    if let view = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first {
                        Updates.check(manual: false, from: view)
                    }
                }
            }
    }

    @ViewBuilder
    private var tabs: some View {
        if #available(iOS 26.0, *) {
            // Liquid Glass tab bar: it shrinks while you scroll, and Search is its own glass button.
            TabView {
                Tab("Home", systemImage: "house.fill") { TabStack { HomeView() } }
                Tab("Shorts", systemImage: "play.rectangle.on.rectangle.fill") { TabStack { ShortsView() } }
                Tab("Subscriptions", systemImage: "rectangle.stack.fill") { TabStack { SubscriptionsView() } }
                Tab("You", systemImage: "person.crop.circle.fill") { TabStack { YouView() } }
                Tab("Search", systemImage: "magnifyingglass", role: .search) { TabStack { SearchView() } }
            }
            .tabBarMinimizeBehavior(.onScrollDown)
        } else {
            TabView {
                AppTab(title: "Home", icon: "house.fill") { HomeView() }
                AppTab(title: "Shorts", icon: "play.rectangle.on.rectangle.fill") { ShortsView() }
                AppTab(title: "Subscriptions", icon: "rectangle.stack.fill") { SubscriptionsView() }
                AppTab(title: "Search", icon: "magnifyingglass") { SearchView() }
                AppTab(title: "You", icon: "person.crop.circle.fill") { YouView() }
            }
        }
    }
}

/// A tab's own navigation stack, so going back stays inside the tab.
struct TabStack<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        NavigationStack {
            content()
                .background(jaceBackground)
                .navigationDestination(for: Route.self) { destination($0) }
        }
    }
}

struct AppTab<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        TabStack(content: content).tabItem { Label(title, systemImage: icon) }
    }
}

let site = URL(string: "https://jace-media.vercel.app")!
let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"

/// The site in the app: only for going live (it needs the camera through the browser engine).
struct WebView: UIViewRepresentable {
    var start: URL = site

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "JaceMediaApp/\(appVersion) (iOS)"

        // What the website can ask the app (window.JaceMediaApp), the same as on Android.
        let auto = Updates.automatic ? "true" : "false"
        let bridge = """
        window.JaceMediaApp = {
          version: () => "\(appVersion)",
          platform: () => "ios",
          autoUpdate: () => \(auto),
          setAutoUpdate: (on) => window.webkit.messageHandlers.jaceMediaApp.postMessage({ setAutoUpdate: !!on }),
          checkForUpdates: () => window.webkit.messageHandlers.jaceMediaApp.postMessage({ check: true }),
        };
        """
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(context.coordinator, name: "jaceMediaApp")

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0x11 / 255, green: 0x13 / 255, blue: 0x17 / 255, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.allowsBackForwardNavigationGestures = true
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        if #available(iOS 16.4, *) { web.isInspectable = true }

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.reload(_:)), for: .valueChanged)
        web.scrollView.refreshControl = refresh
        context.coordinator.web = web

        web.load(URLRequest(url: start))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        weak var web: WKWebView?
        /// Sites that stay inside the app: Jace Media and Jace (for signing in).
        private let inside: Set<String> = ["jace-media.vercel.app", "jaceo.vercel.app"]

        @objc func reload(_ sender: UIRefreshControl) {
            web?.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { sender.endRefreshing() }
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { return decisionHandler(.allow) }
            // Pages and players inside the page (YouTube's player, Jace's videos) load normally.
            if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
            if url.scheme == "https", let host = url.host, inside.contains(host) {
                // Downloads (Jace videos) go to Safari, which saves them to Files.
                if url.query?.contains("download=") == true {
                    UIApplication.shared.open(url)
                    return decisionHandler(.cancel)
                }
                return decisionHandler(.allow)
            }
            if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { return decisionHandler(.allow) }
            // Everything else opens outside the app.
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        /// Links that open a new window (target=_blank) open outside the app, or here if they're Jace Media's.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if let host = url.host, inside.contains(host) { webView.load(URLRequest(url: url)) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        /// confirm() and alert() from the website (e.g. "Delete this post?").
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            Updates.present(alert, from: webView)
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            Updates.present(alert, from: webView)
        }

        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
            let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
            Updates.present(alert, from: webView)
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let web else { return }
            if let on = body["setAutoUpdate"] as? Bool { Updates.automatic = on }
            if body["check"] as? Bool == true { Updates.check(manual: true, from: web) }
        }
    }
}

/// Update checks. AltStore and SideStore install updates from Jace Media's
/// source; this tells you when one is ready and opens them.
enum Updates {
    static var automatic: Bool {
        get { UserDefaults.standard.object(forKey: "autoUpdate") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "autoUpdate") }
    }

    static func check(manual: Bool, from view: UIView) {
        let url = site.appendingPathComponent("api/app-version")
        URLSession.shared.dataTask(with: url) { data, _, _ in
            let latest = (try? JSONSerialization.jsonObject(with: data ?? Data())) as? [String: Any]
            let ios = latest?["ios"] as? [String: Any]
            let version = ios?["version"] as? String
            DispatchQueue.main.async {
                guard let version else {
                    if manual { say("Couldn't check for updates. Try again later.", from: view) }
                    return
                }
                guard newer(version, than: appVersion) else {
                    if manual { say("Jace Media is up to date (\(appVersion)).", from: view) }
                    return
                }
                let alert = UIAlertController(title: "Update Jace Media?", message: "Version \(version) is ready (you have \(appVersion)). Update it in AltStore or SideStore.", preferredStyle: .alert)
                for (name, scheme) in [("SideStore", "sidestore://"), ("AltStore", "altstore://")] {
                    if let app = URL(string: scheme), UIApplication.shared.canOpenURL(app) {
                        alert.addAction(UIAlertAction(title: "Open \(name)", style: .default) { _ in UIApplication.shared.open(app) })
                    }
                }
                alert.addAction(UIAlertAction(title: "Later", style: .cancel))
                present(alert, from: view)
            }
        }.resume()
    }

    static func newer(_ a: String, than b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }
        let y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let p = i < x.count ? x[i] : 0, q = i < y.count ? y[i] : 0
            if p != q { return p > q }
        }
        return false
    }

    static func say(_ text: String, from view: UIView) {
        let alert = UIAlertController(title: nil, message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, from: view)
    }

    static func present(_ alert: UIAlertController, from view: UIView) {
        var top = view.window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        top?.present(alert, animated: true)
    }
}
