import Foundation

/// What Jace Media's app API (/api/app/…) sends back. Fields the app doesn't
/// need are left out; anything missing decodes as nil.

struct Video: Decodable, Identifiable, Hashable {
    let source: String
    let id: String
    let title: String
    let thumbnail: String?
    let channelId: String
    let channelName: String
    let channelPicture: String?
    let publishedAt: String?
    let views: Double?
    let short: Bool?
    let src: String?

    var isShort: Bool { short ?? false }
    var thumbURL: URL? { thumbnail.flatMap(URL.init(string:)) }
}

struct Author: Decodable, Hashable {
    let name: String
    let handle: String
    let picture: String?
}

struct Media: Decodable, Hashable {
    let kind: String
    let url: String?
    let thumb: String?
}

struct Post: Decodable, Identifiable, Hashable {
    let network: String
    let id: String
    let text: String
    let title: String?
    let createdAt: String?
    let author: Author
    let media: [Media]?
    let url: String?
}

struct Account: Decodable, Hashable {
    let sub: String
    let handle: String
    let name: String
    let picture: String?
}

struct Me: Decodable {
    let account: Account?
    let others: [Account]
}

struct Home: Decodable {
    let videos: [Video]
    let shorts: [Video]
    let posts: [Post]
}

struct VideoList: Decodable {
    let videos: [Video]
}

struct Channel: Decodable, Hashable {
    let kind: String
    let ref: String
    let name: String
    let picture: String?
}

struct Subscriptions: Decodable {
    let channels: [Channel]
    let videos: [Video]
    let posts: [Post]
}

struct FoundChannel: Decodable, Hashable {
    let id: String
    let name: String
    let picture: String?
}

struct SearchResults: Decodable {
    let videos: [Video]
    let shorts: [Video]
    let channels: [FoundChannel]
    let posts: [Post]
}

struct VideoStream: Decodable {
    let type: String
    let url: String?
    let id: String?
}

struct WatchVideo: Decodable {
    let source: String
    let id: String
    let title: String
    let description: String
    let channelId: String?
    let channelName: String
    let channelPicture: String?
    let views: Double?
    let likes: Double?
    let dislikes: Double?
    let myVote: Int?
    let live: Bool?
    let thumbnail: String?
    let stream: VideoStream
    let subscribed: Bool?
}

struct Watch: Decodable {
    let video: WatchVideo
    let upNext: [Video]
}

struct ChannelPage: Decodable {
    struct Info: Decodable {
        let name: String
        let picture: String?
        let banner: String?
        let subscribers: Double?
    }
    let channel: Info
    let videos: [Video]
    let shorts: [Video]
}

struct HistoryItem: Decodable, Identifiable, Hashable {
    let source: String
    let id: String
    let title: String
    let channelId: String?
    let channelName: String?
}

struct HistoryList: Decodable {
    let items: [HistoryItem]
}

struct APIError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Talks to Jace Media. Signed-in requests carry the (encrypted) session in a header.
enum API {
    static var session: String?

    static func url(_ path: String) -> URL {
        URL(string: site.absoluteString + path)!
    }

    static func get<T: Decodable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        var req = URLRequest(url: url(path))
        if let session { req.setValue(session, forHTTPHeaderField: "x-jace-media-session") }
        req.setValue("JaceMediaApp/\(appVersion) (iOS)", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "Something went wrong (\(status))."
            throw APIError(message: message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// POST / PUT / DELETE with a JSON body. True when it worked.
    @discardableResult
    static func send(_ path: String, method: String = "POST", body: [String: Any?] = [:]) async -> Bool {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let session { req.setValue(session, forHTTPHeaderField: "x-jace-media-session") }
        let object = body.compactMapValues { $0 }
        // Never hand JSONSerialization something it can't encode (it would crash the app).
        guard JSONSerialization.isValidJSONObject(object) else { return false }
        req.httpBody = try? JSONSerialization.data(withJSONObject: object)
        guard let (_, response) = try? await URLSession.shared.data(for: req) else { return false }
        return (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0)
    }
}

func compactNumber(_ n: Double?) -> String? {
    guard let n else { return nil }
    let f = NumberFormatter()
    f.maximumFractionDigits = 1
    switch n {
    case 1_000_000_000...: return (f.string(from: NSNumber(value: n / 1_000_000_000)) ?? "") + "B"
    case 1_000_000...: return (f.string(from: NSNumber(value: n / 1_000_000)) ?? "") + "M"
    case 1_000...: return (f.string(from: NSNumber(value: n / 1_000)) ?? "") + "K"
    default: return String(Int(n))
    }
}

func timeAgo(_ iso: String?) -> String? {
    guard let iso else { return nil }
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return nil }
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .full
    return f.localizedString(for: date, relativeTo: Date())
}
