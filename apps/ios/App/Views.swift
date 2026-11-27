import AVKit
import SwiftUI
import WebKit

// MARK: - Look

let jaceGreen = Color(red: 0x3d / 255, green: 0xdc / 255, blue: 0x84 / 255)
let jaceBackground = Color(red: 0x11 / 255, green: 0x13 / 255, blue: 0x17 / 255)
let jacePanel = Color(red: 0x1c / 255, green: 0x1f / 255, blue: 0x26 / 255)

/// Where tapping something goes. Every screen is native; only Go live uses the site.
enum Route: Hashable {
    case watch(source: String, id: String)
    case channel(id: String, name: String)
    case post(network: String, id: String)
    case playlist(id: String, name: String)
    case feed(id: String, name: String)
    case posts, notifications, library, live, feeds, myVideos, settings, accounts, history
}

@ViewBuilder
func destination(_ route: Route) -> some View {
    switch route {
    case let .watch(source, id): WatchView(source: source, id: id)
    case let .channel(id, name): ChannelView(id: id, name: name)
    case let .post(network, id): PostDetailView(network: network, id: id)
    case let .playlist(id, name): PlaylistView(id: id, name: name)
    case let .feed(id, name): FeedView(id: id, name: name)
    case .posts: PostsView()
    case .notifications: NotificationsView()
    case .library: LibraryView()
    case .live: LiveView()
    case .feeds: FeedsView()
    case .myVideos: MyVideosView()
    case .settings: SettingsView()
    case .accounts: AccountsView()
    case .history: HistoryView()
    }
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

/// Press and hold a channel: Subscribe / Unsubscribe and Go to channel. (No Subscribe buttons anywhere else.)
struct ChannelHold: ViewModifier {
    @EnvironmentObject var session: SessionStore
    let kind: String
    let ref: String
    let name: String
    let picture: String?
    var showGoTo = true

    func body(content: Content) -> some View {
        content.contextMenu {
            if session.signedIn, !ref.isEmpty {
                let on = session.isFollowing(kind, ref)
                Button {
                    Task { await session.toggleFollow(kind: kind, ref: ref, name: name, picture: picture) }
                } label: {
                    Label(on ? "Unsubscribe from \(name)" : "Subscribe to \(name)", systemImage: on ? "checkmark.circle" : "plus.circle")
                }
            } else if !session.signedIn {
                Button { session.signIn() } label: { Label("Sign in to subscribe", systemImage: "person.crop.circle.badge.plus") }
            }
            if showGoTo, kind == "youtube", !ref.isEmpty {
                NavigationLink(value: Route.channel(id: ref, name: name)) { Label("Go to \(name)", systemImage: "person.crop.square") }
            }
        }
    }
}

extension View {
    func channelHold(kind: String, ref: String, name: String, picture: String?, showGoTo: Bool = true) -> some View {
        modifier(ChannelHold(kind: kind, ref: ref, name: name, picture: picture, showGoTo: showGoTo))
    }
}

struct VideoCard: View {
    @EnvironmentObject var session: SessionStore
    let video: Video
    @State private var hidden = false

    var body: some View {
        if !hidden {
            NavigationLink(value: Route.watch(source: video.source, id: video.id)) {
                VStack(alignment: .leading, spacing: 10) {
                    Thumb(url: video.thumbURL)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .topLeading) {
                            Text(video.source == "jace" ? "JACE" : "YOUTUBE")
                                .font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 7).padding(.vertical, 4)
                                .foregroundStyle(.white)
                                .glass(in: Capsule(), tint: video.source == "jace" ? jaceGreen.opacity(0.6) : Color.red.opacity(0.6))
                                .padding(8)
                        }
                    HStack(alignment: .top, spacing: 10) {
                        Avatar(name: video.channelName, picture: video.channelPicture, size: 34)
                            .channelHold(kind: video.source, ref: video.channelId, name: video.channelName, picture: video.channelPicture)
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
                if session.signedIn {
                    Button { Task { await saveToWatchLater(video) } } label: { Label("Save to Watch Later", systemImage: "clock") }
                    Button {
                        hidden = true
                        Task { await API.send("/api/hidden", body: ["kind": "video", "ref": "\(video.source):\(video.id)"]) }
                    } label: { Label("Not interested", systemImage: "hand.thumbsdown") }
                    Button {
                        hidden = true
                        Task { await API.send("/api/hidden", body: ["kind": "channel", "ref": "\(video.source):\(video.channelId)"]) }
                    } label: { Label("Don't recommend channel", systemImage: "nosign") }
                    let on = session.isFollowing(video.source, video.channelId)
                    Button {
                        Task { await session.toggleFollow(kind: video.source, ref: video.channelId, name: video.channelName, picture: video.channelPicture) }
                    } label: { Label(on ? "Unsubscribe from \(video.channelName)" : "Subscribe to \(video.channelName)", systemImage: on ? "checkmark.circle" : "plus.circle") }
                }
                if video.source == "youtube" {
                    NavigationLink(value: Route.channel(id: video.channelId, name: video.channelName)) { Label("Go to \(video.channelName)", systemImage: "person.crop.square") }
                }
                ShareLink(item: API.url("/watch/\(video.source)/\(video.id)")) { Label("Share", systemImage: "square.and.arrow.up") }
            }
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
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                Text(video.title).font(.caption.weight(.semibold)).lineLimit(2).frame(width: 130, alignment: .leading).foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
    }
}

/// A post from anywhere, with like, replies, and its picture or video.
struct PostRow: View {
    @EnvironmentObject var session: SessionStore
    let post: Post
    var linked = true
    @State private var liked: Bool?
    @State private var likes: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Avatar(name: post.author.name, picture: post.author.picture, size: 38)
                    .channelHold(kind: post.followKind, ref: post.followRef, name: post.author.name, picture: post.author.picture, showGoTo: false)
                VStack(alignment: .leading, spacing: 1) {
                    Text(post.author.name).font(.subheadline.weight(.semibold))
                    Text([post.network == "jace" ? "@\(post.author.handle)" : post.author.handle, networkName(post.network), timeAgo(post.createdAt)].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
            }
            if let title = post.title, !title.isEmpty { Text(title).font(.headline) }
            if !post.text.isEmpty { Text(post.text).font(.subheadline).lineLimit(linked ? 10 : nil) }
            if let v = post.video {
                NavigationLink(value: Route.watch(source: v.source, id: v.id)) {
                    Thumb(url: v.thumbnail.flatMap(URL.init(string:)))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay { Image(systemName: "play.fill").font(.title2).foregroundStyle(.white).frame(width: 56, height: 56).glassCircle() }
                }
                .buttonStyle(.plain)
            } else if let m = post.media?.first(where: { $0.kind == "video" && $0.src != nil }), let src = m.src, let url = URL(string: src) {
                InlineVideo(url: url, poster: m.thumb)
            } else if let image = post.media?.first(where: { $0.kind == "image" }), let src = image.thumb ?? image.url, let url = URL(string: src) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.white.opacity(0.06) }
                    .frame(maxHeight: 340)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            HStack(spacing: 18) {
                Button {
                    guard session.signedIn, post.network == "jace" else { return }
                    let on = !(liked ?? post.likedByMe ?? false)
                    liked = on
                    likes = (likes ?? post.stats?.likes ?? 0) + (on ? 1 : -1)
                    Task {
                        var req = URLRequest(url: API.url("/api/posts/\(post.id)/like"))
                        req.httpMethod = on ? "POST" : "DELETE"
                        if let s = API.session { req.setValue(s, forHTTPHeaderField: "x-jace-media-session") }
                        _ = try? await URLSession.shared.data(for: req)
                    }
                } label: {
                    let on = liked ?? post.likedByMe ?? false
                    Label(compactNumber(likes ?? post.stats?.likes) ?? "Like", systemImage: on ? "heart.fill" : "heart")
                        .foregroundStyle(on ? Color.red : Color.secondary)
                }
                if linked {
                    NavigationLink(value: Route.post(network: post.network, id: post.id)) {
                        Label(compactNumber(post.stats?.replies) ?? "Reply", systemImage: "bubble.left")
                    }
                    .foregroundStyle(.secondary)
                }
                Spacer()
                if let u = post.url, let url = URL(string: u.hasPrefix("/") ? site.absoluteString + u : u) {
                    ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }.foregroundStyle(.secondary)
                }
            }
            .font(.caption.weight(.medium))
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(jacePanel, in: RoundedRectangle(cornerRadius: 20))
    }
}

func networkName(_ n: String) -> String? {
    ["bluesky": "Bluesky", "mastodon": "Mastodon", "lemmy": "Lemmy", "hackernews": "Hacker News", "rss": "News"][n]
}

/// A video inside a post, in Jace Media's player.
struct InlineVideo: View {
    let url: URL
    let poster: String?
    @State private var model: PlayerModel?
    @State private var fullscreen = false

    var body: some View {
        ZStack {
            if let model {
                JacePlayerView(model: model, fullscreen: $fullscreen)
            } else {
                Thumb(url: poster.flatMap(URL.init(string:)))
                Button { model = PlayerModel(.file(url)) } label: {
                    Image(systemName: "play.fill").font(.title2).foregroundStyle(.white).frame(width: 60, height: 60).glassCircle()
                }
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .onDisappear { model?.pause() }
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
            Button("Try again", action: retry).buttonStyle(.jaceProminent)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding()
    }
}

/// Loads something from the API, with loading, error, and pull-to-refresh.
final class Loader<T: Decodable>: ObservableObject {
    @Published var value: T?
    @Published var error: String?
    var path: String

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

struct Shelf<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon).font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 10) { content() }
            }
        }
    }
}

// MARK: - Home

struct HomeView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var home = Loader<Home>("/api/app/home")
    @State private var forYou = false
    @State private var composing = false

    var body: some View {
        ScrollView {
            if let h = home.value {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(Array(h.videos.prefix(4))) { VideoCard(video: $0) }
                    if !h.shorts.isEmpty {
                        Shelf(title: "Shorts", icon: "play.rectangle.on.rectangle") { ForEach(h.shorts) { ShortCard(video: $0) } }
                    }
                    ForEach(Array(h.videos.dropFirst(4).prefix(8))) { VideoCard(video: $0) }
                    if !h.posts.isEmpty {
                        HStack {
                            Text("From people").font(.headline)
                            Spacer()
                            NavigationLink(value: Route.posts) { Text("See all") }.font(.subheadline)
                        }
                        ForEach(Array(h.posts.prefix(10))) { PostRow(post: $0) }
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
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Button { setForYou(false) } label: {
                        if forYou { Text("Home") } else { Label("Home", systemImage: "checkmark") }
                    }
                    Button { setForYou(true) } label: {
                        if forYou { Label("For you", systemImage: "checkmark") } else { Text("For you") }
                    }
                    NavigationLink(value: Route.feeds) { Label("Your feeds", systemImage: "line.3.horizontal.decrease.circle") }
                } label: { Image(systemName: "line.3.horizontal.decrease") }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if session.signedIn {
                    Button { composing = true } label: { Image(systemName: "square.and.pencil") }
                    NavigationLink(value: Route.notifications) { Image(systemName: "bell") }
                }
            }
        }
        .sheet(isPresented: $composing) { ComposeView() }
    }

    private func setForYou(_ on: Bool) {
        forYou = on
        home.path = on ? "/api/app/home?for=you" : "/api/app/home"
        home.value = nil
        Task { await home.load() }
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
    @EnvironmentObject var session: SessionStore
    let video: Video
    let active: Bool
    @State private var model: PlayerModel?
    @State private var comments = false
    @State private var vote = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black
            if active, let model {
                PlayerSurface(model: model)
                    .contentShape(Rectangle())
                    .onTapGesture { model.toggle() }
                    .overlay {
                        if !model.playing && model.ready {
                            Image(systemName: "play.fill").font(.system(size: 30)).foregroundStyle(.white)
                                .frame(width: 80, height: 80).background(Circle().fill(jaceBackground))
                                .allowsHitTesting(false)
                        }
                    }
            } else {
                Thumb(url: video.thumbURL, ratio: 9 / 16)
            }
            LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .center, endPoint: .bottom).allowsHitTesting(false)
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    NavigationLink(value: Route.channel(id: video.channelId, name: video.channelName)) {
                        HStack(spacing: 8) {
                            Avatar(name: video.channelName, picture: video.channelPicture, size: 32)
                            Text(video.channelName).font(.subheadline.weight(.semibold))
                            if session.isFollowing(video.source, video.channelId) {
                                Image(systemName: "checkmark.circle.fill").font(.caption).foregroundStyle(jaceGreen)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .channelHold(kind: video.source, ref: video.channelId, name: video.channelName, picture: video.channelPicture)
                    Text(video.title).font(.subheadline).lineLimit(2)
                }
                Spacer()
                VStack(spacing: 14) {
                    sideButton(vote == 1 ? "hand.thumbsup.fill" : "hand.thumbsup", "Like") { setVote(vote == 1 ? 0 : 1) }
                    sideButton(vote == -1 ? "hand.thumbsdown.fill" : "hand.thumbsdown", "Dislike") { setVote(vote == -1 ? 0 : -1) }
                    sideButton("bubble.left.and.bubble.right.fill", "Comments") { comments = true }
                    ShareLink(item: API.url("/shorts?v=\(video.source):\(video.id)")) {
                        VStack(spacing: 4) {
                            Image(systemName: "arrowshape.turn.up.right.fill").font(.system(size: 18)).frame(width: 48, height: 48).glassCircle()
                            Text("Share").font(.caption2)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.bottom, 96)
        }
        .onChange(of: active, initial: true) { _, on in
            if on {
                if model == nil {
                    if video.source == "jace", let src = video.src, let url = URL(string: src) {
                        model = PlayerModel(.file(url), loop: true)
                    } else {
                        model = PlayerModel(.youtube(video.id), loop: true)
                    }
                } else {
                    model?.play()
                }
            } else {
                model?.pause()
                model = nil
            }
        }
        .sheet(isPresented: $comments) {
            CommentsSheet(source: video.source, id: video.id, title: video.title)
                .presentationDetents([.medium, .large])
        }
    }

    private func sideButton(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 18)).frame(width: 48, height: 48).glassCircle()
                Text(label).font(.caption2)
            }
        }
        .buttonStyle(.plain)
    }

    private func setVote(_ v: Int) {
        guard session.signedIn else { return session.signIn() }
        vote = v
        Task { await API.send("/api/video-likes", body: ["source": video.source, "id": video.id, "channelId": video.channelId, "value": v]) }
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
                                ForEach(s.channels, id: \.ref) { c in
                                    NavigationLink(value: c.kind == "youtube" ? Route.channel(id: c.ref, name: c.name) : Route.posts) {
                                        VStack(spacing: 6) {
                                            Avatar(name: c.name, picture: c.picture, size: 58)
                                            Text(c.name).font(.caption).lineLimit(1).frame(width: 70)
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    .channelHold(kind: c.kind, ref: c.ref, name: c.name, picture: c.picture)
                                }
                            }
                        }
                    }
                    let shorts = s.videos.filter(\.isShort)
                    if !shorts.isEmpty {
                        Shelf(title: "Shorts", icon: "play.rectangle.on.rectangle") { ForEach(shorts) { ShortCard(video: $0) } }
                    }
                    ForEach(s.videos.filter { !$0.isShort }) { VideoCard(video: $0) }
                    if !s.posts.isEmpty {
                        Text("Posts").font(.headline)
                        ForEach(s.posts) { PostRow(post: $0) }
                    }
                    if s.videos.isEmpty && s.posts.isEmpty { Text("Nothing new from the channels you follow.").foregroundStyle(.secondary) }
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
            Button("Sign in with Jace") { session.signIn() }.buttonStyle(.jaceProminent)
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
                    ForEach(r.channels.prefix(3), id: \.id) { c in
                        NavigationLink(value: Route.channel(id: c.id, name: c.name)) {
                            HStack(spacing: 12) {
                                Avatar(name: c.name, picture: c.picture, size: 52)
                                Text(c.name).font(.headline)
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                        .channelHold(kind: "youtube", ref: c.id, name: c.name, picture: c.picture, showGoTo: false)
                    }
                    if !r.shorts.isEmpty {
                        Shelf(title: "Shorts", icon: "play.rectangle.on.rectangle") { ForEach(r.shorts) { ShortCard(video: $0) } }
                    }
                    ForEach(r.videos) { VideoCard(video: $0) }
                    ForEach(r.posts) { PostRow(post: $0) }
                    if r.videos.isEmpty && r.posts.isEmpty && r.channels.isEmpty { Text("Nothing found.").foregroundStyle(.secondary) }
                } else if !searching {
                    VStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").font(.system(size: 40)).foregroundStyle(.secondary)
                        Text("Search videos, Shorts, channels, and posts.").foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 300)
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
                results = try? await API.get("/api/app/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")", as: SearchResults.self)
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
    @State private var showMore = false
    @State private var model: PlayerModel?
    @State private var fullscreen = false
    @State private var comments = false

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                ZStack {
                    if let model {
                        JacePlayerView(model: model, title: watch?.video.title ?? "", fullscreen: $fullscreen)
                    } else {
                        Color.black
                        if error == nil { ProgressView().tint(.white) }
                    }
                }
                .frame(width: geo.size.width, height: fullscreen ? geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom : geo.size.width * 9 / 16)
                .background(Color.black)

                if !fullscreen {
                    ScrollView { details.padding(.top, 14) }
                }
            }
        }
        .ignoresSafeArea(edges: fullscreen ? .all : [])
        .background(fullscreen ? Color.black : jaceBackground)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(fullscreen ? .hidden : .visible, for: .navigationBar, .tabBar)
        .statusBarHidden(fullscreen)
        .persistentSystemOverlays(fullscreen ? .hidden : .automatic)
        .task { await load() }
        .onDisappear { model?.pause() }
        .sheet(isPresented: $comments) {
            CommentsSheet(source: source, id: id, title: watch?.video.title ?? "")
                .presentationDetents([.medium, .large])
        }
    }

    @ViewBuilder
    private var details: some View {
        if let w = watch {
            let v = w.video
            VStack(alignment: .leading, spacing: 14) {
                Text(v.title).font(.title3.weight(.semibold))
                Text([compactNumber(v.views).map { "\($0) views" }, v.live == true ? "🔴 Live" : nil].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
                if let cid = v.channelId {
                    NavigationLink(value: Route.channel(id: cid, name: v.channelName)) {
                        HStack(spacing: 10) {
                            Avatar(name: v.channelName, picture: v.channelPicture, size: 40)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(v.channelName).font(.subheadline.weight(.semibold)).lineLimit(1)
                                Text(session.isFollowing(v.source, cid) ? "Subscribed · hold to change" : "Hold to subscribe").font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .channelHold(kind: v.source, ref: cid, name: v.channelName, picture: v.channelPicture, showGoTo: false)
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
                    .buttonStyle(.jaceGlass)
                    .padding(.vertical, 2)
                }
                if !v.description.isEmpty {
                    Text(v.description)
                        .font(.subheadline)
                        .lineLimit(showMore ? nil : 3)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(jacePanel, in: RoundedRectangle(cornerRadius: 16))
                        .onTapGesture { showMore.toggle() }
                }
                Button { comments = true } label: {
                    HStack {
                        Label("Comments", systemImage: "bubble.left.and.bubble.right")
                        Spacer()
                        Image(systemName: "chevron.up")
                    }
                    .padding(14)
                    .background(jacePanel, in: RoundedRectangle(cornerRadius: 16))
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

    private func load() async {
        guard watch == nil else { return }
        do {
            let w = try await API.get("/api/app/watch/\(source)/\(id)", as: Watch.self)
            watch = w
            vote = w.video.myVote ?? 0
            if model == nil {
                if w.video.stream.type == "file", let s = w.video.stream.url, let url = URL(string: s) {
                    model = PlayerModel(.file(url))
                } else {
                    model = PlayerModel(.youtube(w.video.stream.id ?? w.video.id))
                }
            }
            if session.signedIn {
                await API.send("/api/history", body: ["source": source, "id": id, "title": w.video.title, "channelId": w.video.channelId, "channelName": w.video.channelName, "thumbnail": w.video.thumbnail])
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setVote(_ value: Int) {
        guard session.signedIn else { return session.signIn() }
        vote = value
        Task { await API.send("/api/video-likes", body: ["source": source, "id": id, "channelId": watch?.video.channelId, "value": value]) }
    }
}

// MARK: - Channel

struct ChannelView: View {
    @EnvironmentObject var session: SessionStore
    let id: String
    let name: String
    @State private var page: ChannelPage?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                if let p = page {
                    if let b = p.channel.banner, let url = URL(string: b) {
                        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.white.opacity(0.05) }
                            .frame(height: 90).clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    HStack(spacing: 14) {
                        Avatar(name: p.channel.name, picture: p.channel.picture, size: 64)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(p.channel.name).font(.title2.weight(.bold))
                            if let s = compactNumber(p.channel.subscribers) { Text("\(s) subscribers").font(.caption).foregroundStyle(.secondary) }
                            Text(session.isFollowing("youtube", id) ? "Subscribed · hold to change" : "Hold to subscribe").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .channelHold(kind: "youtube", ref: id, name: p.channel.name, picture: p.channel.picture, showGoTo: false)
                    if !p.shorts.isEmpty {
                        Shelf(title: "Shorts", icon: "play.rectangle.on.rectangle") { ForEach(p.shorts) { ShortCard(video: $0) } }
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
    @State private var composing = false
    @State private var uploading = false
    @State private var goingLive = false
    @State private var accounts = false

    var body: some View {
        List {
            if let a = session.me?.account {
                Section {
                    Button { accounts = true } label: {
                        HStack(spacing: 14) {
                            Avatar(name: a.name, picture: a.picture, size: 56)
                            VStack(alignment: .leading) {
                                Text(a.name).font(.headline)
                                Text("@\(a.handle)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Label("Switch", systemImage: "arrow.left.arrow.right").font(.caption.weight(.semibold)).labelStyle(.titleAndIcon)
                                .padding(.horizontal, 10).padding(.vertical, 6).glassCapsule()
                        }
                    }
                    .buttonStyle(.plain)
                }
                Section("Make") {
                    Button { composing = true } label: { Label("Write a post", systemImage: "square.and.pencil") }
                    Button { uploading = true } label: { Label("Upload a video", systemImage: "arrow.up.circle") }
                    Button { goingLive = true } label: { Label("Go live", systemImage: "dot.radiowaves.left.and.right") }
                    NavigationLink(value: Route.myVideos) { Label("Your videos", systemImage: "film") }
                }
                Section("Library") {
                    NavigationLink(value: Route.library) { Label("Library", systemImage: "books.vertical") }
                    NavigationLink(value: Route.notifications) { Label("Notifications", systemImage: "bell") }
                    NavigationLink(value: Route.history) { Label("History", systemImage: "clock.arrow.circlepath") }
                    ForEach((history.value?.items ?? []).prefix(5)) { h in
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
            Section("Explore") {
                NavigationLink(value: Route.live) { Label("Live", systemImage: "antenna.radiowaves.left.and.right") }
                NavigationLink(value: Route.posts) { Label("Posts", systemImage: "text.bubble") }
                NavigationLink(value: Route.feeds) { Label("Your feeds", systemImage: "line.3.horizontal.decrease.circle") }
            }
            Section {
                NavigationLink(value: Route.settings) { Label("Settings", systemImage: "gearshape") }
                if session.signedIn {
                    Button { accounts = true } label: { Label("Switch account", systemImage: "person.2") }
                }
            }
        }
        .navigationTitle("You")
        .task(id: session.signedIn) { if session.signedIn { await history.load() } }
        .sheet(isPresented: $composing) { ComposeView() }
        .sheet(isPresented: $uploading) { UploadView() }
        .sheet(isPresented: $accounts) { NavigationStack { AccountsView() }.presentationDetents([.medium, .large]) }
        .fullScreenCover(isPresented: $goingLive) { SiteScreen(path: "/live/go") }
    }
}

// MARK: - The site, full screen (only for going live, which needs the camera in the browser engine)

struct SiteScreen: View {
    let path: String
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var ready = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            jaceBackground.ignoresSafeArea()
            if ready { WebView(start: API.url(path + (path.contains("?") ? "&" : "?") + "app=1")).ignoresSafeArea(edges: .bottom) } else { LoadingView() }
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 15, weight: .bold)).foregroundStyle(.white).frame(width: 40, height: 40).glassCircle()
            }
            .padding(.leading, 12)
            .padding(.top, 4)
        }
        .onAppear { session.shareWithWebViews { ready = true } }
    }
}
