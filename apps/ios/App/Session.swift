import AuthenticationServices
import Foundation
import Security
import UIKit
import WebKit

/// Who's signed in. Signing in opens Jace's sign-in page in a secure sheet
/// (ASWebAuthenticationSession); Jace Media sends back an encrypted session,
/// kept in the iPhone's Keychain.
final class SessionStore: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var token: String?
    @Published var me: Me?
    @Published var error: String?
    private var auth: ASWebAuthenticationSession?

    override init() {
        super.init()
        token = Keychain.read()
        API.session = token
    }

    var signedIn: Bool { token != nil && me?.account != nil }

    @MainActor
    func loadMe() async {
        do {
            me = try await API.get("/api/app/me", as: Me.self)
            // The session no longer works (signed out on Jace, or banned): forget it.
            if token != nil && me?.account == nil { set(nil) }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Who you subscribe to and follow, as "kind:ref" (lowercase).
    @Published var following: Set<String> = []

    func isFollowing(_ kind: String, _ ref: String) -> Bool { following.contains("\(kind):\(ref.lowercased())") }

    @MainActor
    func loadFollowing() async {
        guard token != nil else { following = []; return }
        if let f = try? await API.get("/api/app/following", as: FollowingResponse.self) { following = Set(f.following) }
    }

    /// Subscribe / unsubscribe (follow / unfollow). Returns the new state.
    @MainActor
    @discardableResult
    func toggleFollow(kind: String, ref: String, name: String, picture: String?) async -> Bool {
        let key = "\(kind):\(ref.lowercased())"
        let on = !following.contains(key)
        if on { following.insert(key) } else { following.remove(key) }
        let ok = await API.send("/api/subscriptions", method: on ? "POST" : "DELETE", body: ["kind": kind, "ref": ref, "name": name, "picture": picture])
        if !ok { if on { following.remove(key) } else { following.insert(key) } }
        return ok ? on : !on
    }

    /// Use another account that's on this phone.
    @MainActor
    func switchTo(_ sub: String) async {
        guard let a = try? await API.post("/api/app/session", body: ["action": "switch", "sub": sub], as: SessionAnswer.self) else {
            error = "Couldn't switch accounts. Try again."
            return
        }
        set(a.session)
        if a.reauth == true { error = "That account needs to sign in again." }
        await loadMe()
        await loadFollowing()
    }

    /// Signs one account out of this phone (the others stay).
    @MainActor
    func remove(_ sub: String) async {
        guard let a = try? await API.post("/api/app/session", body: ["action": "remove", "sub": sub], as: SessionAnswer.self) else { return }
        set(a.session)
        if a.session == nil { me = nil }
        await loadMe()
        await loadFollowing()
    }

    @MainActor
    func signIn(addAccount: Bool = false) {
        let url = API.url("/api/app/signin" + (addAccount ? "?mode=add" : ""))
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "jacemedia") { [weak self] callback, _ in
            guard let callback,
                  let value = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "session" })?.value
            else { return }
            Task { @MainActor in
                guard let self else { return }
                // Adding an account keeps the ones already on this phone.
                if addAccount, self.token != nil,
                   let merged = try? await API.post("/api/app/session", body: ["action": "merge", "other": value], as: SessionAnswer.self),
                   let s = merged.session {
                    self.set(s)
                } else {
                    self.set(value)
                }
                await self.loadMe()
                await self.loadFollowing()
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        auth = session
        session.start()
    }

    @MainActor
    func signOut() {
        set(nil)
        me = nil
        following = []
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            for c in cookies where c.domain.contains("jace-media") {
                WKWebsiteDataStore.default().httpCookieStore.delete(c)
            }
        }
    }

    @MainActor
    private func set(_ value: String?) {
        token = value
        API.session = value
        Keychain.save(value)
    }

    /// Lets the web screens (uploading, posting, settings) use the same sign-in.
    func shareWithWebViews(_ done: @escaping () -> Void) {
        guard let token,
              let cookie = HTTPCookie(properties: [
                  .domain: site.host ?? "jace-media.vercel.app",
                  .path: "/",
                  .name: "jm_accounts",
                  .value: token,
                  .secure: "TRUE",
                  .expires: Date().addingTimeInterval(60 * 60 * 24 * 300),
              ])
        else { return done() }
        WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie, completionHandler: done)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
        }
    }
}

enum Keychain {
    private static let service = "com.okjace.jacemedia"
    private static let account = "session"

    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ value: String?) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }
}
