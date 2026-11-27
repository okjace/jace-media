import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Comments (any video): like any comment, reply to any comment, open replies

struct CommentsSheet: View {
    let source: String
    let id: String
    let title: String
    @EnvironmentObject var session: SessionStore
    @State private var data: CommentsResponse?
    @State private var error = false
    @State private var text = ""
    @State private var replyTo: (key: String, name: String)?
    @State private var sending = false
    @State private var reloadReplies = 0
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if error { Text("Couldn't load comments.").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 40) }
                    if data == nil && !error { LoadingView() }
                    if let d = data {
                        ForEach(d.mine) { c in
                            CommentCell(key: c.key, ytId: nil, name: c.author.name, picture: c.author.picture, text: c.text, when: c.createdAt,
                                        likes: c.likes ?? 0, liked: c.liked ?? false, replies: c.replies ?? 0, pinned: false,
                                        reload: reloadReplies, onReply: { startReply(c.key, c.author.name) })
                        }
                        if !d.others.isEmpty && source == "youtube" {
                            Text("ON YOUTUBE").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                        }
                        ForEach(d.others) { c in
                            CommentCell(key: c.key, ytId: c.key.hasPrefix("yt:") ? c.id : nil, name: c.name, picture: c.picture, text: c.text, when: c.when,
                                        likes: c.likes ?? 0, liked: c.liked ?? false, replies: c.replies ?? 0, pinned: c.pinned ?? false,
                                        reload: reloadReplies, onReply: { startReply(c.key, c.name) })
                        }
                        if d.mine.isEmpty && d.others.isEmpty {
                            Text("No comments yet. Be the first!").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 30)
                        }
                    }
                }
                .padding(16)
            }
            .safeAreaInset(edge: .bottom) { composer }
            .navigationTitle("Comments")
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let r = replyTo {
                HStack {
                    Text("Replying to \(r.name)").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button("Cancel") { replyTo = nil; text = "" }.font(.caption)
                }
            }
            if session.signedIn {
                HStack(spacing: 10) {
                    TextField(replyTo == nil ? "Add a comment" : "Add a reply", text: $text, axis: .vertical)
                        .lineLimit(1...5)
                        .focused($focused)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .glass(in: RoundedRectangle(cornerRadius: 22))
                    Button { Task { await send() } } label: {
                        Image(systemName: sending ? "hourglass" : "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(.black)
                            .frame(width: 42, height: 42).glassCircle(tint: jaceGreen)
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending)
                }
            } else {
                Button("Sign in to comment") { session.signIn() }.buttonStyle(.jaceProminent).frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private func startReply(_ key: String, _ name: String) {
        guard session.signedIn else { return session.signIn() }
        replyTo = (key, name)
        focused = true
    }

    private func load() async {
        do {
            data = try await API.get("/api/comments?source=\(source)&id=\(id)", as: CommentsResponse.self)
            error = false
        } catch { self.error = true }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        sending = true
        defer { sending = false }
        let ok: Bool
        if let r = replyTo {
            ok = await API.send("/api/ext-comments", body: ["network": "comment", "postId": r.key, "body": body])
        } else if source == "jace" {
            ok = await API.send("/api/jace-comments", body: ["postId": id, "body": body])
        } else {
            ok = await API.send("/api/ext-comments", body: ["network": "youtube", "postId": id, "body": body])
        }
        if ok {
            text = ""
            replyTo = nil
            focused = false
            reloadReplies += 1
            await load()
        }
    }
}

/// One comment: like, reply, and its replies (which can be liked and replied to too).
struct CommentCell: View {
    let key: String
    let ytId: String?
    let name: String
    let picture: String?
    let text: String
    let when: String?
    let likes: Double
    let liked: Bool
    let replies: Int
    let pinned: Bool
    var small = false
    var reload = 0
    let onReply: () -> Void
    @EnvironmentObject var session: SessionStore
    @State private var on: Bool?
    @State private var count: Double?
    @State private var open = false
    @State private var thread: RepliesResponse?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Avatar(name: name, picture: picture, size: small ? 28 : 36)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(name).font(.subheadline.weight(.semibold))
                    if let t = timeAgo(when) { Text("· \(t)").font(.caption).foregroundStyle(.secondary) }
                    if pinned { Label("Pinned", systemImage: "pin.fill").font(.caption2).foregroundStyle(jaceGreen) }
                }
                Text(text).font(small ? .subheadline : .body)
                HStack(spacing: 16) {
                    Button { toggleLike() } label: {
                        let isOn = on ?? liked
                        Label((count ?? likes) > 0 ? compactNumber(count ?? likes) ?? "" : "", systemImage: isOn ? "heart.fill" : "heart")
                            .foregroundStyle(isOn ? Color.red : Color.secondary)
                    }
                    Button("Reply", action: onReply).foregroundStyle(.secondary)
                    if replies > 0 || thread != nil {
                        Button {
                            open.toggle()
                            if open && thread == nil { Task { await loadThread() } }
                        } label: {
                            let n = max(replies, (thread?.replies.count ?? 0) + (thread?.mine.count ?? 0))
                            Text(open ? "Hide replies" : "\(n) repl\(n == 1 ? "y" : "ies")").foregroundStyle(jaceGreen)
                        }
                    }
                }
                .font(.caption.weight(.semibold))
                .buttonStyle(.plain)
                .padding(.top, 2)
                if open {
                    VStack(alignment: .leading, spacing: 14) {
                        if thread == nil { ProgressView().tint(jaceGreen) }
                        ForEach(thread?.mine ?? []) { c in
                            CommentCell(key: c.key, ytId: nil, name: c.author.name, picture: c.author.picture, text: c.text, when: c.createdAt,
                                        likes: c.likes ?? 0, liked: c.liked ?? false, replies: 0, pinned: false, small: true, onReply: onReply)
                        }
                        ForEach(thread?.replies ?? []) { c in
                            CommentCell(key: c.key, ytId: nil, name: c.name, picture: c.picture, text: c.text, when: c.when,
                                        likes: c.likes ?? 0, liked: c.liked ?? false, replies: 0, pinned: false, small: true, onReply: onReply)
                        }
                    }
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) { Rectangle().fill(.white.opacity(0.1)).frame(width: 2) }
                    .padding(.top, 6)
                }
            }
        }
        .onChange(of: reload) { _, _ in
            if open || replies > 0 { Task { await loadThread() } }
        }
    }

    private func toggleLike() {
        guard session.signedIn else { return session.signIn() }
        let next = !(on ?? liked)
        on = next
        count = (count ?? likes) + (next ? 1 : -1)
        Task {
            if let r = try? await API.post("/api/comment-likes", body: ["key": key, "like": next], as: LikeResult.self) {
                on = r.mine
            } else {
                on = !next
                count = (count ?? likes) + (next ? -1 : 1)
            }
        }
    }

    private func loadThread() async {
        var q = "/api/comments?key=\(key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? key)"
        if let ytId { q += "&replies=\(ytId)" }
        thread = (try? await API.get(q, as: RepliesResponse.self)) ?? RepliesResponse(replies: [], mine: [])
    }
}

// MARK: - Posts

struct PostsView: View {
    @EnvironmentObject var session: SessionStore
    @StateObject private var posts = Loader<PostsResponse>("/api/app/posts")
    @State private var composing = false

    var body: some View {
        ScrollView {
            if let p = posts.value {
                LazyVStack(spacing: 14) { ForEach(p.posts) { PostRow(post: $0) } }.padding(16)
            } else if let error = posts.error {
                ErrorView(message: error) { Task { await posts.load() } }
            } else {
                LoadingView()
            }
        }
        .refreshable { await posts.load() }
        .task { if posts.value == nil { await posts.load() } }
        .navigationTitle("Posts")
        .toolbar {
            if session.signedIn {
                ToolbarItem(placement: .topBarTrailing) { Button { composing = true } label: { Image(systemName: "square.and.pencil") } }
            }
        }
        .sheet(isPresented: $composing, onDismiss: { Task { await posts.load() } }) { ComposeView() }
    }
}

struct PostThread: Decodable {
    let post: Post
    let replies: [Post]
    let comments: [Post]
}

struct PostDetailView: View {
    let network: String
    let id: String
    @EnvironmentObject var session: SessionStore
    @State private var thread: PostThread?
    @State private var error: String?
    @State private var text = ""
    @State private var sending = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if let t = thread {
                    PostRow(post: t.post, linked: false)
                    if !t.comments.isEmpty {
                        Text("On Jace Media").font(.headline).padding(.top, 6)
                        ForEach(t.comments) { PostRow(post: $0, linked: false) }
                    }
                    if !t.replies.isEmpty {
                        Text(network == "jace" ? "Replies" : "Replies on \(networkName(network) ?? network)").font(.headline).padding(.top, 6)
                        ForEach(t.replies) { PostRow(post: $0, linked: network == "jace") }
                    }
                } else if let error {
                    ErrorView(message: error) { Task { await load() } }
                } else {
                    LoadingView()
                }
            }
            .padding(16)
        }
        .safeAreaInset(edge: .bottom) {
            if session.signedIn {
                HStack(spacing: 10) {
                    TextField("Write a reply", text: $text, axis: .vertical)
                        .lineLimit(1...5)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .glass(in: RoundedRectangle(cornerRadius: 22))
                    Button { Task { await reply() } } label: {
                        Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(.black).frame(width: 42, height: 42).glassCircle(tint: jaceGreen)
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(.bar)
            }
        }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let encoded = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id
            thread = try await API.get("/api/app/post/\(network)/\(encoded)", as: PostThread.self)
        } catch { self.error = error.localizedDescription }
    }

    private func reply() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        sending = true
        defer { sending = false }
        let ok = network == "jace"
            ? await API.send("/api/posts", body: ["body": body, "parentId": id])
            : await API.send("/api/ext-comments", body: ["network": network, "postId": id, "body": body])
        if ok {
            text = ""
            await load()
        }
    }
}

/// Write a post: text and a picture (from Photos).
struct ComposeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var session: SessionStore
    @State private var text = ""
    @State private var photo: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var sending = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                if let a = session.me?.account {
                    HStack(spacing: 10) {
                        Avatar(name: a.name, picture: a.picture, size: 40)
                        Text(a.name).font(.headline)
                    }
                }
                TextField("What's happening?", text: $text, axis: .vertical)
                    .lineLimit(4...14)
                    .font(.body)
                    .padding(14)
                    .background(jacePanel, in: RoundedRectangle(cornerRadius: 18))
                if let image {
                    Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 220).clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(alignment: .topTrailing) {
                            Button { self.image = nil; photo = nil } label: { Image(systemName: "xmark").frame(width: 30, height: 30).glassCircle() }.padding(6)
                        }
                }
                HStack {
                    PhotosPicker(selection: $photo, matching: .images) { Label("Picture", systemImage: "photo") }.buttonStyle(.jaceGlass)
                    Spacer()
                    Text("\(1000 - text.count)").font(.caption).foregroundStyle(text.count > 1000 ? .red : .secondary)
                }
                if let error { Text(error).font(.caption).foregroundStyle(.red) }
                Spacer()
            }
            .padding(16)
            .navigationTitle("New post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(sending ? "Posting…" : "Post") { Task { await post() } }
                        .disabled(sending || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && image == nil) || text.count > 1000)
                }
            }
            .onChange(of: photo) { _, item in
                Task {
                    if let data = try? await item?.loadTransferable(type: Data.self) { image = UIImage(data: data) }
                }
            }
        }
    }

    private func post() async {
        sending = true
        error = nil
        defer { sending = false }
        var imageUrl: String?
        if let image, let jpeg = image.resized(maxSide: 1600).jpegData(compressionQuality: 0.82) {
            let file = FileManager.default.temporaryDirectory.appendingPathComponent("picture-\(UUID().uuidString).jpg")
            do {
                try jpeg.write(to: file)
                imageUrl = try await API.upload(file: file, kind: "thumbnail", contentType: "image/jpeg").public_url
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
        do {
            _ = try await API.post("/api/posts", body: ["body": text, "imageUrl": imageUrl], as: Created.self)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension UIImage {
    func resized(maxSide: CGFloat) -> UIImage {
        let scale = min(1, maxSide / max(size.width, size.height))
        guard scale < 1 else { return self }
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        return UIGraphicsImageRenderer(size: target).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}

// MARK: - Notifications

struct NotificationsView: View {
    @StateObject private var list = Loader<NotificationsResponse>("/api/app/notifications")

    var body: some View {
        List {
            if let items = list.value?.items {
                if items.isEmpty { Text("No notifications yet.").foregroundStyle(.secondary) }
                ForEach(items) { n in
                    let row = HStack(alignment: .top, spacing: 12) {
                        Avatar(name: n.actor.name, picture: n.actor.picture, size: 40)
                        VStack(alignment: .leading, spacing: 3) {
                            (Text(n.actor.name).bold() + Text(" \(n.text)")).font(.subheadline)
                            if let t = n.postText, !t.isEmpty { Text(t).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                            if let w = timeAgo(n.createdAt) { Text(w).font(.caption2).foregroundStyle(.secondary) }
                        }
                    }
                    .listRowBackground(n.read == false ? jaceGreen.opacity(0.08) : Color.clear)
                    if let p = n.postId {
                        NavigationLink(value: Route.post(network: "jace", id: p)) { row }
                    } else {
                        row
                    }
                }
            } else if let error = list.error {
                ErrorView(message: error) { Task { await list.load() } }
            } else {
                LoadingView()
            }
        }
        .navigationTitle("Notifications")
        .refreshable { await list.load() }
        .task { await list.load() }
    }
}

// MARK: - Library

struct LibraryView: View {
    @StateObject private var lib = Loader<LibraryResponse>("/api/app/library")

    var body: some View {
        ScrollView {
            if let l = lib.value {
                LazyVStack(alignment: .leading, spacing: 24) {
                    if !l.continueWatching.isEmpty {
                        Shelf(title: "Continue watching", icon: "play.circle") {
                            ForEach(l.continueWatching) { v in VideoCard(video: v).frame(width: 260) }
                        }
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Watch Later", systemImage: "clock").font(.headline)
                        if l.watchLater.isEmpty { Text("Hold a video and choose Save to Watch Later.").font(.subheadline).foregroundStyle(.secondary) }
                        ForEach(l.watchLater) { VideoCard(video: $0) }
                    }
                    if !l.playlists.isEmpty {
                        Label("Playlists", systemImage: "list.bullet.rectangle").font(.headline)
                        ForEach(l.playlists) { p in
                            NavigationLink(value: Route.playlist(id: p.id, name: p.name)) {
                                HStack(spacing: 12) {
                                    Thumb(url: p.thumbnail.flatMap(URL.init(string:))).frame(width: 120).clipShape(RoundedRectangle(cornerRadius: 12))
                                    VStack(alignment: .leading) {
                                        Text(p.name).font(.headline)
                                        Text("\(p.count ?? 0) videos").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(16)
            } else if let error = lib.error {
                ErrorView(message: error) { Task { await lib.load() } }
            } else {
                LoadingView()
            }
        }
        .navigationTitle("Library")
        .refreshable { await lib.load() }
        .task { await lib.load() }
    }
}

struct PlaylistView: View {
    let id: String
    let name: String
    @State private var list: PlaylistResponse?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 22) {
                if let l = list {
                    if l.videos.isEmpty { Text("This playlist is empty.").foregroundStyle(.secondary) }
                    ForEach(l.videos) { VideoCard(video: $0) }
                } else {
                    LoadingView()
                }
            }
            .padding(16)
        }
        .navigationTitle(name)
        .task { list = try? await API.get("/api/app/playlist/\(id)", as: PlaylistResponse.self) }
    }
}

struct HistoryView: View {
    @StateObject private var history = Loader<HistoryList>("/api/app/history")

    var body: some View {
        List {
            ForEach(history.value?.items ?? []) { h in
                NavigationLink(value: Route.watch(source: h.source, id: h.id)) {
                    VStack(alignment: .leading) {
                        Text(h.title).lineLimit(2)
                        if let c = h.channelName { Text(c).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
        }
        .navigationTitle("History")
        .refreshable { await history.load() }
        .task { await history.load() }
    }
}

// MARK: - Live

struct LiveView: View {
    @StateObject private var live = Loader<LiveResponse>("/api/app/live")
    @State private var watching: LiveStream?

    var body: some View {
        ScrollView {
            if let l = live.value {
                LazyVStack(alignment: .leading, spacing: 22) {
                    if !l.jace.isEmpty {
                        Label("Live on Jace Media", systemImage: "dot.radiowaves.left.and.right").font(.headline)
                        ForEach(l.jace) { s in
                            Button { watching = s } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Thumb(url: s.thumbnail.flatMap(URL.init(string:)))
                                        .clipShape(RoundedRectangle(cornerRadius: 16))
                                        .overlay(alignment: .topLeading) {
                                            Text("LIVE · \(s.viewers ?? 0)").font(.caption2.bold()).foregroundStyle(.white).padding(.horizontal, 8).padding(.vertical, 4).glass(in: Capsule(), tint: .red.opacity(0.7)).padding(8)
                                        }
                                    HStack(spacing: 10) {
                                        Avatar(name: s.host.name, picture: s.host.picture, size: 34).overlay(Circle().stroke(Color.red, lineWidth: 2))
                                        Text(s.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if !l.youtube.isEmpty {
                        Label("Live on YouTube", systemImage: "antenna.radiowaves.left.and.right").font(.headline)
                        ForEach(l.youtube) { VideoCard(video: $0) }
                    }
                    if l.jace.isEmpty && l.youtube.isEmpty { Text("Nobody's live right now.").foregroundStyle(.secondary) }
                }
                .padding(16)
            } else if let error = live.error {
                ErrorView(message: error) { Task { await live.load() } }
            } else {
                LoadingView()
            }
        }
        .navigationTitle("Live")
        .refreshable { await live.load() }
        .task { await live.load() }
        .fullScreenCover(item: $watching) { s in SiteScreen(path: "/live/watch/\(s.id)") }
    }
}

// MARK: - Feeds

struct FeedsView: View {
    @StateObject private var feeds = Loader<FeedsResponse>("/api/app/feeds")

    var body: some View {
        List {
            ForEach(feeds.value?.feeds ?? []) { f in
                NavigationLink(value: Route.feed(id: f.id, name: f.name)) {
                    HStack {
                        Label(f.name, systemImage: "line.3.horizontal.decrease.circle")
                        if f.home == true { Spacer(); Text("Home").font(.caption).foregroundStyle(jaceGreen) }
                    }
                }
            }
            if feeds.value?.feeds.isEmpty == true { Text("You haven't made any feeds yet.").foregroundStyle(.secondary) }
        }
        .navigationTitle("Your feeds")
        .task { await feeds.load() }
    }
}

struct FeedView: View {
    let id: String
    let name: String
    @State private var feed: FeedResponse?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                if let f = feed {
                    if !f.shorts.isEmpty { Shelf(title: "Shorts", icon: "play.rectangle.on.rectangle") { ForEach(f.shorts) { ShortCard(video: $0) } } }
                    ForEach(f.videos) { VideoCard(video: $0) }
                    ForEach(f.posts) { PostRow(post: $0) }
                } else {
                    LoadingView()
                }
            }
            .padding(16)
        }
        .navigationTitle(name)
        .task { feed = try? await API.get("/api/app/feed/\(id)", as: FeedResponse.self) }
    }
}

// MARK: - Your videos

struct MyVideosView: View {
    @StateObject private var mine = Loader<MyVideosResponse>("/api/app/myvideos")
    @State private var uploading = false

    var body: some View {
        List {
            if let list = mine.value?.videos {
                if list.isEmpty { Text("You haven't uploaded any videos yet.").foregroundStyle(.secondary) }
                ForEach(list) { v in
                    NavigationLink(value: Route.watch(source: "jace", id: v.id)) {
                        HStack(spacing: 12) {
                            Thumb(url: v.thumbnail.flatMap(URL.init(string:))).frame(width: 120).clipShape(RoundedRectangle(cornerRadius: 10))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(v.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                                Text([v.visibility?.capitalized, timeAgo(v.publishedAt)].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } else if let error = mine.error {
                ErrorView(message: error) { Task { await mine.load() } }
            } else {
                LoadingView()
            }
        }
        .navigationTitle("Your videos")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { uploading = true } label: { Image(systemName: "plus") } } }
        .refreshable { await mine.load() }
        .task { await mine.load() }
        .sheet(isPresented: $uploading, onDismiss: { Task { await mine.load() } }) { UploadView() }
    }
}

// MARK: - Upload (native: pick from Photos or Files, preview, send to Jace)

struct PickedMovie: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in SentTransferredFile(movie.url) } importing: { received in
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent("upload-\(UUID().uuidString).\(received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return Self(url: copy)
        }
    }
}

struct UploadView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var item: PhotosPickerItem?
    @State private var file: URL?
    @State private var preview: PlayerModel?
    @State private var fullscreen = false
    @State private var title = ""
    @State private var description = ""
    @State private var visibility = "public"
    @State private var progress: Double?
    @State private var error: String?
    @State private var done = false
    @State private var importing = false
    @State private var loadingPick = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let preview {
                        JacePlayerView(model: preview, fullscreen: $fullscreen)
                            .aspectRatio(16 / 9, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .listRowInsets(EdgeInsets())
                    }
                    PhotosPicker(selection: $item, matching: .videos) {
                        Label(file == nil ? "Choose from Photos" : "Choose another video", systemImage: "photo.on.rectangle")
                    }
                    Button { importing = true } label: { Label("Choose from Files", systemImage: "folder") }
                    if loadingPick { ProgressView("Getting the video…") }
                }
                Section("Details") {
                    TextField("Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical).lineLimit(3...8)
                    Picker("Who can watch", selection: $visibility) {
                        Text("Everyone").tag("public")
                        Text("People with the link").tag("unlisted")
                        Text("Only you").tag("private")
                    }
                }
                if let progress {
                    Section {
                        ProgressView(value: progress) { Text(done ? "Uploaded!" : "Uploading… \(Int(progress * 100))%") }.tint(jaceGreen)
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle("Upload")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(done ? "Done" : "Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Upload") { Task { await upload() } }
                        .disabled(file == nil || title.trimmingCharacters(in: .whitespaces).isEmpty || (progress != nil && !done) || done)
                }
            }
            .onChange(of: item) { _, picked in
                guard let picked else { return }
                loadingPick = true
                Task {
                    defer { loadingPick = false }
                    if let movie = try? await picked.loadTransferable(type: PickedMovie.self) { use(movie.url) } else { error = "Couldn't get that video." }
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.movie, .video, .mpeg4Movie, .quickTimeMovie]) { result in
                if case let .success(url) = result {
                    let ok = url.startAccessingSecurityScopedResource()
                    defer { if ok { url.stopAccessingSecurityScopedResource() } }
                    let copy = FileManager.default.temporaryDirectory.appendingPathComponent("upload-\(UUID().uuidString).\(url.pathExtension)")
                    if (try? FileManager.default.copyItem(at: url, to: copy)) != nil { use(copy) } else { error = "Couldn't open that file." }
                }
            }
            .onDisappear { preview?.pause() }
        }
    }

    private func use(_ url: URL) {
        file = url
        error = nil
        preview = PlayerModel(.file(url), autoplay: false)
        if title.isEmpty { title = url.deletingPathExtension().lastPathComponent.hasPrefix("upload-") ? "" : url.deletingPathExtension().lastPathComponent }
    }

    private func upload() async {
        guard let file else { return }
        preview?.pause()
        error = nil
        progress = 0
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "video/mp4"
        do {
            let ticket = try await API.upload(file: file, kind: "video", contentType: type) { f in progress = f * 0.97 }
            struct Made: Decodable {}
            _ = try await API.post("/api/videos", body: ["path": ticket.path, "title": title, "description": description, "visibility": visibility], as: Made.self)
            progress = 1
            done = true
        } catch {
            self.error = error.localizedDescription
            progress = nil
        }
    }
}

// MARK: - Accounts

struct AccountsView: View {
    @EnvironmentObject var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var busy: String?

    var body: some View {
        List {
            if let a = session.me?.account {
                Section("Using") {
                    HStack(spacing: 12) {
                        Avatar(name: a.name, picture: a.picture, size: 44)
                        VStack(alignment: .leading) {
                            Text(a.name).font(.headline)
                            Text("@\(a.handle)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(jaceGreen)
                    }
                    .swipeActions { Button("Sign out", role: .destructive) { Task { await session.remove(a.sub) } } }
                }
            }
            if let others = session.me?.others, !others.isEmpty {
                Section("On this iPhone") {
                    ForEach(others) { o in
                        Button {
                            busy = o.sub
                            Task {
                                await session.switchTo(o.sub)
                                busy = nil
                                dismiss()
                            }
                        } label: {
                            HStack(spacing: 12) {
                                Avatar(name: o.name, picture: o.picture, size: 44)
                                VStack(alignment: .leading) {
                                    Text(o.name).font(.headline)
                                    Text("@\(o.handle)").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if busy == o.sub { ProgressView() }
                            }
                        }
                        .buttonStyle(.plain)
                        .swipeActions { Button("Remove", role: .destructive) { Task { await session.remove(o.sub) } } }
                    }
                }
            }
            Section {
                Button { session.signIn(addAccount: true) } label: { Label("Add another account", systemImage: "person.badge.plus") }
                if session.signedIn {
                    Button(role: .destructive) { session.signOut(); dismiss() } label: { Label("Sign out of all accounts", systemImage: "rectangle.portrait.and.arrow.right") }
                }
            }
            if let e = session.error { Section { Text(e).foregroundStyle(.secondary) } }
        }
        .navigationTitle("Accounts")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Settings

let serviceList: [(String, String)] = [
    ("youtube", "YouTube"), ("jacevideos", "Jace videos"), ("jace", "Jace posts"), ("bluesky", "Bluesky"), ("mastodon", "Mastodon"),
    ("lemmy", "Lemmy"), ("hackernews", "Hacker News"), ("rss", "News & blogs"), ("jacelive", "Jace Live"), ("twitch", "Twitch"),
]

let extensionList: [(String, String, String)] = [
    ("sponsorblock", "SponsorBlock", "Skips sponsor segments"),
    ("dislikes", "Return YouTube Dislike", "Shows dislike counts"),
    ("dearrow", "DeArrow", "Better titles and thumbnails"),
    ("hideShorts", "Hide Shorts", "Removes Shorts from every feed"),
    ("hideWatched", "Hide watched videos", "Watched videos leave your feeds"),
    ("autoplayNext", "Autoplay next", "Plays the next video when one ends"),
    ("resume", "Resume where you left off", "Long videos pick up where you stopped"),
    ("hideCounts", "Hide counts", "Hides views, likes, and followers"),
]

struct AppSettings: Decodable {
    let services: [String]?
    let extensions: [String: Flex]?
}

/// A setting's value: on/off or a word.
enum Flex: Decodable {
    case bool(Bool), text(String), other
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let b = try? c.decode(Bool.self) { self = .bool(b) } else if let s = try? c.decode(String.self) { self = .text(s) } else { self = .other }
    }
    var bool: Bool? { if case let .bool(b) = self { return b } else { return nil } }
    var text: String? { if case let .text(s) = self { return s } else { return nil } }
}

struct SettingsView: View {
    @EnvironmentObject var session: SessionStore
    @State private var services: Set<String> = []
    @State private var ext: [String: Bool] = [:]
    @State private var rating = "teen"
    @State private var loaded = false
    @State private var autoUpdate = Updates.automatic
    @AppStorage("quality") private var quality = "default"

    var body: some View {
        Form {
            Section {
                ForEach(serviceList, id: \.0) { s in
                    Toggle(s.1, isOn: Binding(get: { services.contains(s.0) }, set: { on in
                        var next = services
                        if on { next.insert(s.0) } else { next.remove(s.0) }
                        guard !next.isEmpty else { return }
                        services = next
                        Task { await API.send("/api/preferences", method: "PUT", body: ["services": Array(next)]) }
                    }))
                }
            } header: { Text("Services") } footer: { Text("What shows up in your feeds.") }
            Section("Content filter") {
                Picker("Show", selection: Binding(get: { rating }, set: { r in
                    rating = r
                    Task { await API.send("/api/extensions", method: "PUT", body: ["merge": true, "rating": r]) }
                })) {
                    Text("Kids").tag("kids")
                    Text("Teen").tag("teen")
                    Text("Everything").tag("all")
                }
                .pickerStyle(.segmented)
            }
            Section("Player") {
                Picker("Video quality", selection: $quality) { ForEach(qualities, id: \.0) { Text($0.1).tag($0.0) } }
            }
            Section("Extensions") {
                ForEach(extensionList, id: \.0) { e in
                    Toggle(isOn: Binding(get: { ext[e.0] ?? false }, set: { on in
                        ext[e.0] = on
                        Task { await API.send("/api/extensions", method: "PUT", body: ["merge": true, e.0: on]) }
                    })) {
                        VStack(alignment: .leading) {
                            Text(e.1)
                            Text(e.2).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section("App") {
                Toggle("Tell me about updates", isOn: Binding(get: { autoUpdate }, set: { autoUpdate = $0; Updates.automatic = $0 }))
                Button {
                    if let view = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first { Updates.check(manual: true, from: view) }
                } label: { Label("Check for updates (\(appVersion))", systemImage: "arrow.triangle.2.circlepath") }
            }
        }
        .tint(jaceGreen)
        .navigationTitle("Settings")
        .task {
            guard !loaded, let s = try? await API.get("/api/app/me", as: AppSettings.self) else { return }
            loaded = true
            services = Set(s.services ?? [])
            for (k, v) in s.extensions ?? [:] {
                if let b = v.bool { ext[k] = b }
                if k == "rating", let r = v.text { rating = r }
            }
        }
    }
}
