import AVKit
import SwiftUI
import WebKit

// MARK: - Look

let jaceGreen = Color(red: 0x3d / 255, green: 0xdc / 255, blue: 0x84 / 255)
let jaceBackground = Color(red: 0x11 / 255, green: 0x13 / 255, blue: 0x17 / 255)
let jacePanel = Color(red: 0x1c / 255, green: 0x1f / 255, blue: 0x26 / 255)

/// Where tapping something goes.
enum Route: Hashable {
    case watch(source: String, id: String)
    case channel(id: String, name: String)
    case web(path: String, title: String)
}

struct Avatar: View {
    let name: String
    let picture: String?
    var size: CGFloat = 36

    var body: some View {
        Group {
            if let picture, let url = URL(string: picture) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Circle().fill(jaceGreen.opacity(0.15))
                }
            } else {
                Circle().fill(jaceGreen.opacity(0.15))
                    .overlay(Text(String(name.prefix(1)).uppercased()).font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(jaceGreen))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

struct Thumb: View {
    let url: URL?
    var ratio: CGFloat = 16 / 9

    var body: some View {
        Color.white.opacity(0.06)
            .aspectRatio(ratio, contentMode: .fit)
            .overlay {
                if let url {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.clear
                    }
                }
            }
            .clipped()
    }
}

struct VideoCard: View {
    let video: Video

    var body: some View {
        NavigationLink(value: Route.watch(source: video.source, id: video.id)) {
            VStack(alignment: .leading, spacing: 10) {
                Thumb(url: video.thumbURL)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(alignment: .topLeading) {
                        Text(video.source == "jace" ? "JACE" : "YOUTUBE")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(video.source == "jace" ? jaceGreen : Color.red, in: RoundedRectangle(cornerRadius: 4))
                            .foregroundStyle(video.source == "jace" ? Color.black : Color.white)
                            .padding(8)
                    }
                HStack(alignment: .top, spacing: 10) {
                    Avatar(name: video.channelName, picture: video.channelPicture, size: 34)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(video.title).font(.subheadline.weight(.semibold)).lineLimit(2).foregroundStyle(.white)
                        Text([video.channelName, compactNumber(video.views).map { "\($0) views" }, timeAgo(video.publishedAt)].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { Task { await saveToWatchLater(video) } } label: { Label("Save to Watch Later", systemImage: "clock") }
            Button { Task { await API.send("/api/hidden", body: ["kind": "video", "ref": "\(video.source):\(video.id)"]) } } label: {
                Label("Not interested", systemImage: "hand.thumbsdown")
            }
            ShareLink(item: API.url("/watch/\(video.source)/\(video.id)")) { Label("Share", systemImage: "square.and.arrow.up") }
        }
    }
}

func saveToWatchLater(_ v: Video) async {
    await API.send("/api/playlists/watch-later/items", body: [
        "video": ["source": v.source, "id": v.id, "title": v.title, "thumbnail": v.thumbnail ?? "", "channelId": v.channelId, "channelName": v.channelName, "short": v.isShort] as [String: Any],
    ])
}

struct ShortCard: View {
    let video: Video

    var body: some View {
        NavigationLink(value: Route.watch(source: video.source, id: video.id)) {
            VStack(alignment: .leading, spacing: 6) {
                Thumb(url: video.thumbURL, ratio: 9 / 16)
                    .frame(width: 130)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                Text(video.title).font(.caption.weight(.semibold)).lineLimit(2).frame(width: 130, alignment: .leading).foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
    }
}

struct PostRow: View {
    let post: Post

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Avatar(name: post.author.name, picture: post.author.picture, size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(post.author.name).font(.subheadline.weight(.semibold))
                    Text([post.network == "jace" ? "@\(post.author.handle)" : post.author.handle, timeAgo(post.createdAt)].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            if let title = post.title, !title.isEmpty { Text(title).font(.headline) }
            if !post.text.isEmpty { Text(post.text).font(.subheadline).lineLimit(8) }
            if let image = post.media?.first(where: { $0.kind == "image" }), let src = image.thumb ?? image.url, let url = URL(string: src) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.white.opacity(0.06) }
                    .frame(maxHeight: 320)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(14)
        .background(jacePanel, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct LoadingView: View {
    var body: some View {
        ProgressView().tint(jaceGreen).frame(maxWidth: .infinity, minHeight: 240)
    }
}

struct ErrorView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("Try again", action: retry).buttonStyle(.borderedProminent).tint(jaceGreen)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding()
    }
}

/// Loads something from the API, with loading, error, and pull-to-refresh.
final class Loader<T: Decodable>: ObservableObject {
    @Published var value: T?
    @Published var error: String?
    let path: String

    init(_ path: String) { self.path = path }

    @MainActor
    func load() async {
        do {
            value = try await API.get(path, as: T.self)
            error = nil
        } catch {
            if value == nil { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Home

struct HomeView: View {
    @StateObject private var home = Loader<Home>("/api/app/home")

    var body: some View {
        ScrollView {
            if let h = home.value {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(Array(h.videos.prefix(4))) { VideoCard(video: $0) }
                    if !h.shorts.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Shorts", systemImage: "play.rectangle.on.rectangle").font(.headline)
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(spacing: 10) { ForEach(h.shorts) { ShortCard(video: $0) } }
                            }
                        }
                    }
                    ForEach(Array(h.videos.dropFirst(4).prefix(8))) { VideoCard(video: $0) }
                    if !h.posts.isEmpty {
                        Text("From people").font(.headline)
                        ForEach(Array(h.posts.prefix(10))) { post in
                            NavigationLink(value: Route.web(path: post.network == "jace" ? "/post/\(post.id)" : "/p/\(post.network)/\(post.id)", title: "Post")) {
                                PostRow(post: post)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    ForEach(Array(h.videos.dropFirst(12))) { VideoCard(video: $0) }
                }
                .padding(16)
            } else if let error = home.error {
                ErrorView(message: error) { Task { await home.load() } }
            } else {
                LoadingView()
            }
        }
        .refreshable { await home.load() }
        .task { if home.value == nil { await home.load() } }
        .navigationTitle("Jace Media")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Route.web(path: "/notifications", title: "Notifications")) { Image(systemName: "bell") }
            }
        }
    }
}

// MARK: - Shorts

struct ShortsView: View {
    @StateObject private var shorts = Loader<VideoList>("/api/app/shorts")
    @State private var current: String?

    var body: some View {
        Group {
            if let list = shorts.value?.videos, !list.isEmpty {
                ScrollView(.vertical) {
                    LazyVStack(spacing: 0) {
                        ForEach(list) { v in
                            ShortPage(video: v, active: current == v.id || (current == nil && v.id == list.first?.id))
                                .containerRelativeFrame([.horizontal, .vertical])
                                .id(v.id)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $current)
                .scrollIndicators(.hidden)
                .ignoresSafeArea(edges: .top)
            } else if let error = shorts.error {
                ErrorView(message: error) { Task { await shorts.load() } }
            } else {
                LoadingView()
            }
        }
        .background(Color.black)
        .task { if shorts.value == nil { await shorts.load() } }
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct ShortPage: View {
    let video: Video
    let active: Bool

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Color.black
            if active {
                if video.source == "jace", let src = video.src, let url = URL(string: src) {
                    LoopingPlayer(url: url)
                } else {
                    YouTubePlayer(id: video.id, autoplay: true)
                }
            } else {
                Thumb(url: video.thumbURL, ratio: 9 / 16)
            }
            LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .center, endPoint: .bottom).allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 6) {
                NavigationLink(value: Route.channel(id: video.channelId, name: video.channelName)) {
                    HStack(spacing: 8) {
                        Avatar(name: video.channelName, picture: video.channelPicture, size: 30)
                        Text(video.channelName).font(.subheadline.weight(.semibold))
                    }
                }
                .buttonStyle(.plain)
                Text(video.title).font(.subheadline).lineLimit(2)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.bottom, 90)
        }
    }
}

/// A Jace Short: plays on repeat.
struct LoopingPlayer: View {
    let url: URL
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?

    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                let queue = AVQueuePlayer()
                looper = AVPlayerLooper(player: queue, templateItem: AVPlayerItem(url: url))
                player = queue
                queue.play()
            }
            .onDisappear {
                player?.pause()
                player = nil
                looper = nil
            }
    }
}

// MARK: - Subscriptions

struct SubscriptionsView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var subs = Loader<Subscriptions>("/api/app/subscriptions")

    var body: some View {
        ScrollView {
            if !session.signedIn {
                SignInPrompt(text: "Sign in to see videos from the channels and people you follow.")
            } else if let s = subs.value {
                LazyVStack(alignment: .leading, spacing: 22) {
                    if !s.channels.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 14) {
                                ForEach(s.channels.filter { $0.kind == "youtube" }, id: \.ref) { c in
                                    NavigationLink(value: Route.channel(id: c.ref, name: c.name)) {
                                        VStack(spacing: 6) {
                                            Avatar(name: c.name, picture: c.picture, size: 58)
                                            Text(c.name).font(.caption).lineLimit(1).frame(width: 70)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    let shorts = s.videos.filter(\.isShort)
                    if !shorts.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 10) { ForEach(shorts) { ShortCard(video: $0) } }
                        }
                    }
                    ForEach(s.videos.filter { !$0.isShort }) { VideoCard(video: $0) }
                    if s.videos.isEmpty { Text("Nothing new from the channels you follow.").foregroundStyle(.secondary) }
                }
                .padding(16)
            } else if let error = subs.error {
                ErrorView(message: error) { Task { await subs.load() } }
            } else {
                LoadingView()
            }
        }
        .refreshable { await subs.load() }
        .task(id: session.signedIn) { if session.signedIn { await subs.load() } }
        .navigationTitle("Subscriptions")
    }
}

struct SignInPrompt: View {
    @EnvironmentObject var session: SessionStore
    let text: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.crop.circle.badge.plus").font(.system(size: 44)).foregroundStyle(jaceGreen)
            Text(text).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Sign in with Jace") { session.signIn() }.buttonStyle(.borderedProminent).tint(jaceGreen).foregroundStyle(.black)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
        .padding(.horizontal, 30)
    }
}

// MARK: - Search

struct SearchView: View {
    @State private var text = ""
    @State private var results: SearchResults?
    @State private var searching = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                if searching { LoadingView() }
                if let r = results {
                    if !r.channels.isEmpty {
                        ForEach(r.channels.prefix(3), id: \.id) { c in
                            NavigationLink(value: Route.channel(id: c.id, name: c.name)) {
                                HStack(spacing: 12) {
                                    Avatar(name: c.name, picture: c.picture, size: 52)
                                    Text(c.name).font(.headline)
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if !r.shorts.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 10) { ForEach(r.shorts) { ShortCard(video: $0) } }
                        }
                    }
                    ForEach(r.videos) { VideoCard(video: $0) }
                    ForEach(r.posts) { PostRow(post: $0) }
                    if r.videos.isEmpty && r.posts.isEmpty && r.channels.isEmpty { Text("Nothing found.").foregroundStyle(.secondary) }
                }
            }
            .padding(16)
        }
        .navigationTitle("Search")
        .searchable(text: $text, prompt: "Search Jace Media")
        .onSubmit(of: .search) {
            let q = text.trimmingCharacters(in: .whitespaces)
            guard !q.isEmpty else { return }
            searching = true
            Task {
                results = try? await API.get("/api/app/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")", as: SearchResults.self)
                searching = false
            }
        }
    }
}

// MARK: - Watch

struct WatchView: View {
    let source: String
    let id: String
    @EnvironmentObject var session: SessionStore
    @State private var watch: Watch?
    @State private var error: String?
    @State private var vote = 0
    @State private var subscribed = false
    @State private var showMore = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Group {
                    if let v = watch?.video {
                        if v.stream.type == "file", let s = v.stream.url, let url = URL(string: s) {
                            FilePlayer(url: url)
                        } else {
                            YouTubePlayer(id: v.stream.id ?? v.id, autoplay: true)
                        }
                    } else {
                        Color.black
                    }
                }
                .aspectRatio(16 / 9, contentMode: .fit)
                .background(Color.black)

                if let w = watch {
                    let v = w.video
                    VStack(alignment: .leading, spacing: 12) {
                        Text(v.title).font(.title3.weight(.semibold))
                        Text([compactNumber(v.views).map { "\($0) views" }, v.live == true ? "🔴 Live" : nil].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                        HStack(spacing: 10) {
                            if let cid = v.channelId {
                                NavigationLink(value: Route.channel(id: cid, name: v.channelName)) {
                                    HStack(spacing: 10) {
                                        Avatar(name: v.channelName, picture: v.channelPicture, size: 40)
                                        Text(v.channelName).font(.subheadline.weight(.semibold)).lineLimit(1)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                            Spacer()
                            if session.signedIn, let cid = v.channelId {
                                Button(subscribed ? "Subscribed" : "Subscribe") {
                                    subscribed.toggle()
                                    Task {
                                        await API.send("/api/subscriptions", method: subscribed ? "POST" : "DELETE",
                                                       body: ["kind": v.source, "ref": cid, "name": v.channelName, "picture": v.channelPicture])
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(subscribed ? Color.white.opacity(0.15) : jaceGreen)
                                .foregroundStyle(subscribed ? Color.white : Color.black)
                            }
                        }
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                Button { setVote(vote == 1 ? 0 : 1) } label: {
                                    Label(compactNumber(v.likes.map { $0 + Double(vote == 1 ? 1 : 0) - Double(v.myVote == 1 ? 1 : 0) }) ?? "Like", systemImage: vote == 1 ? "hand.thumbsup.fill" : "hand.thumbsup")
                                }
                                Button { setVote(vote == -1 ? 0 : -1) } label: {
                                    Label(compactNumber(v.dislikes) ?? "Dislike", systemImage: vote == -1 ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                                }
                                Button {
                                    Task {
                                        await saveToWatchLater(Video(source: v.source, id: v.id, title: v.title, thumbnail: v.thumbnail, channelId: v.channelId ?? "", channelName: v.channelName, channelPicture: v.channelPicture, publishedAt: nil, views: nil, short: false, src: nil))
                                    }
                                } label: { Label("Save", systemImage: "clock") }
                                ShareLink(item: API.url("/watch/\(v.source)/\(v.id)")) { Label("Share", systemImage: "square.and.arrow.up") }
                            }
                            .buttonStyle(.bordered)
                            .tint(.white)
                            .disabled(!session.signedIn)
                        }
                        if !v.description.isEmpty {
                            Text(v.description)
                                .font(.subheadline)
                                .lineLimit(showMore ? nil : 3)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(jacePanel, in: RoundedRectangle(cornerRadius: 12))
                                .onTapGesture { showMore.toggle() }
                        }
                        NavigationLink(value: Route.web(path: "/watch/\(v.source)/\(v.id)", title: "Comments")) {
                            Label("Comments", systemImage: "bubble.left.and.bubble.right")
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(jacePanel, in: RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                        Text("Up next").font(.headline).padding(.top, 6)
                        ForEach(w.upNext) { VideoCard(video: $0) }
                    }
                    .padding(.horizontal, 16)
                } else if let error {
                    ErrorView(message: error) { Task { await load() } }
                } else {
                    LoadingView()
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let w = try await API.get("/api/app/watch/\(source)/\(id)", as: Watch.self)
            watch = w
            vote = w.video.myVote ?? 0
            subscribed = w.video.subscribed ?? false
            if session.signedIn {
                await API.send("/api/history", body: ["source": source, "id": id, "title": w.video.title, "channelId": w.video.channelId, "channelName": w.video.channelName, "thumbnail": w.video.thumbnail])
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setVote(_ value: Int) {
        vote = value
        Task { await API.send("/api/video-likes", body: ["source": source, "id": id, "channelId": watch?.video.channelId, "value": value]) }
    }
}

/// Jace videos: Apple's player, with picture-in-picture and AirPlay.
struct FilePlayer: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                let p = AVPlayer(url: url)
                player = p
                p.play()
            }
            .onDisappear { player?.pause() }
    }
}

/// YouTube videos: YouTube's privacy-enhanced player, with no ads added by Jace Media.
struct YouTubePlayer: UIViewRepresentable {
    let id: String
    var autoplay = true

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        let src = "https://www.youtube-nocookie.com/embed/\(id)?playsinline=1&autoplay=\(autoplay ? 1 : 0)&rel=0&modestbranding=1&iv_load_policy=3"
        let html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
        <body><iframe src="\(src)" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>
        """
        web.loadHTMLString(html, baseURL: site)
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - Channel

struct ChannelView: View {
    let id: String
    let name: String
    @State private var page: ChannelPage?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                if let p = page {
                    HStack(spacing: 14) {
                        Avatar(name: p.channel.name, picture: p.channel.picture, size: 64)
                        VStack(alignment: .leading) {
                            Text(p.channel.name).font(.title2.weight(.bold))
                            if let s = compactNumber(p.channel.subscribers) { Text("\(s) subscribers").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    if !p.shorts.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 10) { ForEach(p.shorts) { ShortCard(video: $0) } }
                        }
                    }
                    ForEach(p.videos) { VideoCard(video: $0) }
                } else {
                    LoadingView()
                }
            }
            .padding(16)
        }
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .task { page = try? await API.get("/api/app/channel/youtube/\(id)", as: ChannelPage.self) }
    }
}

// MARK: - You

struct YouView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var history = Loader<HistoryList>("/api/app/history")

    var body: some View {
        List {
            if let a = session.me?.account {
                Section {
                    HStack(spacing: 14) {
                        Avatar(name: a.name, picture: a.picture, size: 56)
                        VStack(alignment: .leading) {
                            Text(a.name).font(.headline)
                            Text("@\(a.handle)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Section("Make") {
                    NavigationLink(value: Route.web(path: "/upload", title: "Upload")) { Label("Upload a video", systemImage: "arrow.up.circle") }
                    NavigationLink(value: Route.web(path: "/live/go", title: "Go live")) { Label("Go live", systemImage: "dot.radiowaves.left.and.right") }
                    NavigationLink(value: Route.web(path: "/jace", title: "Posts")) { Label("Posts", systemImage: "text.bubble") }
                }
                Section("Library") {
                    NavigationLink(value: Route.web(path: "/playlists/watch-later", title: "Watch Later")) { Label("Watch Later", systemImage: "clock") }
                    NavigationLink(value: Route.web(path: "/playlists", title: "Playlists")) { Label("Playlists", systemImage: "list.bullet.rectangle") }
                    NavigationLink(value: Route.web(path: "/studio", title: "Your videos")) { Label("Your videos", systemImage: "film") }
                    ForEach((history.value?.items ?? []).prefix(15)) { h in
                        NavigationLink(value: Route.watch(source: h.source, id: h.id)) {
                            VStack(alignment: .leading) {
                                Text(h.title).lineLimit(1)
                                if let c = h.channelName { Text(c).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
            } else {
                Section { SignInPrompt(text: "Sign in with Jace to subscribe, like, post, and keep your history.") }
            }
            Section("Settings") {
                NavigationLink(value: Route.web(path: "/live", title: "Live")) { Label("Live", systemImage: "antenna.radiowaves.left.and.right") }
                NavigationLink(value: Route.web(path: "/services", title: "Choose services")) { Label("Choose services", systemImage: "square.grid.2x2") }
                NavigationLink(value: Route.web(path: "/extensions", title: "Extensions")) { Label("Extensions", systemImage: "puzzlepiece.extension") }
                NavigationLink(value: Route.web(path: "/feeds", title: "Your feeds")) { Label("Custom feeds", systemImage: "line.3.horizontal.decrease.circle") }
                Button {
                    if let view = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first { Updates.check(manual: true, from: view) }
                } label: { Label("Check for updates (\(appVersion))", systemImage: "arrow.triangle.2.circlepath") }
                if session.signedIn {
                    Button { session.signIn(addAccount: true) } label: { Label("Add another account", systemImage: "person.badge.plus") }
                    Button(role: .destructive) { session.signOut() } label: { Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right") }
                }
            }
        }
        .navigationTitle("You")
        .task(id: session.signedIn) { if session.signedIn { await history.load() } }
    }
}

// MARK: - Web screens (posting, uploads, settings: the full site, signed in)

struct WebScreen: View {
    let path: String
    let title: String
    @EnvironmentObject var session: SessionStore
    @State private var ready = false

    var body: some View {
        Group {
            if ready { WebView(start: API.url(path)) } else { LoadingView() }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { session.shareWithWebViews { ready = true } }
    }
}
