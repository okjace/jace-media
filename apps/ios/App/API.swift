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
    let src: String?
}

struct PostStats: Decodable, Hashable {
    let likes: Double?
    let replies: Double?
    let reposts: Double?
}

struct PostVideo: Decodable, Hashable {
    let source: String
    let id: String
    let title: String?
    let thumbnail: String?
    let src: String?
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
    let stats: PostStats?
    let likedByMe: Bool?
    let canDelete: Bool?
    let video: PostVideo?
    let authorSub: String?

    /// Who to follow from this post (like the website's followTarget).
    var followKind: String { network }
    var followRef: String {
        switch network {
        case "jace": return authorSub ?? ""
        case "bluesky", "mastodon": return author.handle.hasPrefix("@") ? String(author.handle.dropFirst()) : author.handle
        default: return ""
        }
    }

    /// Where its page is on the site.
    var path: String { network == "jace" ? "/post/\(id)" : "/p/\(network)/\(id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id)" }
}

struct Account: Decodable, Hashable, Identifiable {
    let sub: String
    let handle: String
    let name: String
    let picture: String?
    var id: String { sub }
}

struct Me: Decodable {
    let account: Account?
    let others: [Account]
    let services: [String]?
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

// MARK: - More screens (comments, posts, library, live, feeds, settings, upload)

/// A comment from YouTube or Jace (or a reply). `key` likes it and replies to it.
struct OtherComment: Decodable, Identifiable, Hashable {
    let id: String
    let key: String
    let name: String
    let picture: String?
    let text: String
    let when: String?
    let likes: Double?
    let liked: Bool?
    let pinned: Bool?
    let replies: Int?
}

/// A comment someone wrote on Jace Media.
struct MineComment: Decodable, Identifiable, Hashable {
    let id: String
    let key: String
    let text: String
    let createdAt: String?
    let author: Author
    let likes: Double?
    let liked: Bool?
    let replies: Int?
    let canDelete: Bool?
    let canEdit: Bool?
}

struct CommentsResponse: Decodable {
    let mine: [MineComment]
    let others: [OtherComment]
}

struct RepliesResponse: Decodable {
    let replies: [OtherComment]
    let mine: [MineComment]
}

struct LikeResult: Decodable {
    let count: Int
    let mine: Bool
}

struct NotificationItem: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let actor: Author
    let postId: String?
    let postText: String?
    let read: Bool?
    let createdAt: String?

    var text: String {
        switch kind {
        case "reply": return "replied to your post"
        case "like": return "liked your post"
        case "repost": return "reposted your post"
        case "quote": return "quoted your post"
        case "follow": return "followed you"
        case "mention": return "mentioned you"
        case "live": return "is live now"
        default: return kind
        }
    }
}

struct NotificationsResponse: Decodable {
    let items: [NotificationItem]
}

struct PlaylistInfo: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let count: Int?
    let thumbnail: String?
}

struct LibraryResponse: Decodable {
    let continueWatching: [Video]
    let watchLater: [Video]
    let playlists: [PlaylistInfo]
}

struct PlaylistResponse: Decodable {
    let name: String
    let videos: [Video]
}

struct LiveHost: Decodable, Hashable {
    let name: String
    let picture: String?
}

struct LiveStream: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let thumbnail: String?
    let viewers: Int?
    let host: LiveHost
}

struct LiveResponse: Decodable {
    let jace: [LiveStream]
    let youtube: [Video]
}

struct PostsResponse: Decodable {
    let posts: [Post]
}

struct FeedInfo: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let home: Bool?
}

struct FeedsResponse: Decodable {
    let feeds: [FeedInfo]
}

struct FeedResponse: Decodable {
    struct Info: Decodable { let id: String; let name: String }
    let feed: Info
    let videos: [Video]
    let shorts: [Video]
    let posts: [Post]
}

struct FollowingResponse: Decodable {
    let following: [String]
}

struct MyVideo: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let thumbnail: String?
    let publishedAt: String?
    let src: String?
    let visibility: String?
}

struct MyVideosResponse: Decodable {
    let videos: [MyVideo]
}

struct MeSettings: Decodable {
    struct Ext: Decodable { let rating: String? }
    let services: [String]?
    let extensions: Ext?
}

struct UploadTicket: Decodable {
    let path: String
    let upload_url: String
    let method: String
    let headers: [String: String]?
    let public_url: String?
}

struct SessionAnswer: Decodable {
    let session: String?
    let reauth: Bool?
    let banned: Bool?
}

struct Created: Decodable {
    let id: String?
}

extension API {
    /// POST (or PUT / DELETE) JSON and read the answer.
    static func post<T: Decodable>(_ path: String, body: [String: Any?], as type: T.Type = T.self, method: String = "POST") async throws -> T {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("JaceMediaApp/\(appVersion) (iOS)", forHTTPHeaderField: "User-Agent")
        if let session { req.setValue(session, forHTTPHeaderField: "x-jace-media-session") }
        let object = body.compactMapValues { $0 }
        guard JSONSerialization.isValidJSONObject(object) else { throw APIError(message: "Couldn't send that.") }
        req.httpBody = try JSONSerialization.data(withJSONObject: object)
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "Something went wrong (\(status))."
            throw APIError(message: message)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Sends a file straight to Jace's storage and returns its path (and public address).
    /// `progress` gets 0…1 as it goes.
    static func upload(file: URL, kind: String, contentType: String, progress: @escaping (Double) -> Void = { _ in }) async throws -> UploadTicket {
        let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
        let ticket = try await post("/api/uploads", body: ["kind": kind, "filename": file.lastPathComponent, "content_type": contentType, "size": size], as: UploadTicket.self)
        guard let target = URL(string: ticket.upload_url) else { throw APIError(message: "Upload failed.") }

        // Jace's storage takes the file as a form, like the website sends it.
        let boundary = "JaceMedia-\(UUID().uuidString)"
        let body = FileManager.default.temporaryDirectory.appendingPathComponent("upload-\(UUID().uuidString)")
        FileManager.default.createFile(atPath: body.path, contents: nil)
        let out = try FileHandle(forWritingTo: body)
        func write(_ s: String) { out.write(s.data(using: .utf8)!) }
        write("--\(boundary)\r\nContent-Disposition: form-data; name=\"cacheControl\"\r\n\r\n3600\r\n")
        write("--\(boundary)\r\nContent-Disposition: form-data; name=\"\"; filename=\"\(file.lastPathComponent)\"\r\nContent-Type: \(contentType)\r\n\r\n")
        let input = try FileHandle(forReadingFrom: file)
        while let chunk = try input.read(upToCount: 4 << 20), !chunk.isEmpty { out.write(chunk) }
        try input.close()
        write("\r\n--\(boundary)--\r\n")
        try out.close()
        defer { try? FileManager.default.removeItem(at: body) }

        var req = URLRequest(url: target)
        req.httpMethod = ticket.method
        for (k, v) in ticket.headers ?? [:] where !v.isEmpty && k.lowercased() != "content-type" { req.setValue(v, forHTTPHeaderField: k) }
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let watcher = UploadProgress(progress)
        let session = URLSession(configuration: .default, delegate: watcher, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, response) = try await session.upload(for: req, fromFile: body)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw APIError(message: status == 413 ? "That file is bigger than Jace allows." : "Upload failed\(msg.map { ": \($0)" } ?? " (\(status))").")
        }
        progress(1)
        return ticket
    }
}

final class UploadProgress: NSObject, URLSessionTaskDelegate {
    let report: (Double) -> Void
    init(_ report: @escaping (Double) -> Void) { self.report = report }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        let f = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        DispatchQueue.main.async { self.report(f) }
    }
}
