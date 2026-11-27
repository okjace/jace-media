import AVFoundation
import AVKit
import SwiftUI
import WebKit

// MARK: - Liquid Glass

extension View {
    /// Liquid Glass on iOS 26, frosted material before that.
    @ViewBuilder
    func glass<S: Shape>(in shape: S, tint: Color? = nil, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(interactive ? Glass.regular.tint(tint).interactive() : Glass.regular.tint(tint), in: shape)
        } else {
            self.background(tint.map { AnyShapeStyle($0.opacity(0.85)) } ?? AnyShapeStyle(.ultraThinMaterial), in: shape)
        }
    }

    func glassCapsule(tint: Color? = nil) -> some View { glass(in: Capsule(), tint: tint, interactive: true) }
    func glassCircle(tint: Color? = nil) -> some View { glass(in: Circle(), tint: tint, interactive: true) }
}

/// A button that's a glass pill (or green when it's the main action).
struct GlassButtonStyle: ButtonStyle {
    var prominent = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .foregroundStyle(prominent ? Color.black : Color.white)
            .glassCapsule(tint: prominent ? jaceGreen : nil)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == GlassButtonStyle {
    static var jaceGlass: GlassButtonStyle { GlassButtonStyle() }
    static var jaceProminent: GlassButtonStyle { GlassButtonStyle(prominent: true) }
}

// MARK: - The player

/// Plays a video in Jace Media's own player: Jace videos and files with Apple's
/// engine (AVPlayer), YouTube videos with YouTube's engine hidden behind Jace
/// Media's controls (no YouTube buttons, title, or play sign).
final class PlayerModel: NSObject, ObservableObject {
    enum Kind: Equatable {
        case file(URL)
        case youtube(String)
    }

    let kind: Kind
    let loop: Bool
    @Published var time: Double = 0
    @Published var duration: Double = 0
    @Published var buffered: Double = 0
    @Published var playing = false
    @Published var waiting = true
    @Published var ready = false
    @Published var ended = false
    @Published var rate: Double = 1
    @Published var quality = UserDefaults.standard.string(forKey: "quality") ?? "default"
    @Published var captions = false
    @Published var error: String?

    private(set) var av: AVPlayer?
    /// Picture in picture for Apple's engine (also starts by itself when you leave the app while playing).
    var pip: AVPictureInPictureController?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private(set) var web: WKWebView?
    private var bridge: Bridge?
    private var wantsPlay = true

    init(_ kind: Kind, loop: Bool = false, autoplay: Bool = true) {
        self.kind = kind
        self.loop = loop
        self.wantsPlay = autoplay
        super.init()
        switch kind {
        case let .file(url): setUpFile(url)
        case let .youtube(id): setUpYouTube(id)
        }
    }

    deinit {
        if let timeObserver { av?.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        av?.pause()
        web?.configuration.userContentController.removeScriptMessageHandler(forName: "yt")
    }

    var isYouTube: Bool { if case .youtube = kind { return true } else { return false } }

    // ----- Apple's engine -----

    private func setUpFile(_ url: URL) {
        let p = AVPlayer(url: url)
        p.automaticallyWaitsToMinimizeStalling = true
        av = p
        timeObserver = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { [weak self] t in
            guard let self, let p = self.av else { return }
            self.time = t.seconds
            if let d = p.currentItem?.duration.seconds, d.isFinite { self.duration = d }
            if let r = p.currentItem?.loadedTimeRanges.last?.timeRangeValue, self.duration > 0 {
                self.buffered = min(1, (r.start.seconds + r.duration.seconds) / self.duration)
            }
            self.playing = p.timeControlStatus != .paused
            self.waiting = p.timeControlStatus == .waitingToPlayAtSpecifiedRate
            if p.currentItem?.status == .readyToPlay { self.ready = true }
            if p.currentItem?.status == .failed { self.error = "This video can't be played right now." }
        }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: p.currentItem, queue: .main) { [weak self] _ in
            guard let self else { return }
            if self.loop {
                self.av?.seek(to: .zero)
                self.av?.play()
            } else {
                self.ended = true
                self.playing = false
            }
        }
        if wantsPlay { p.play() }
    }

    // ----- YouTube's engine, behind our controls -----

    final class Bridge: NSObject, WKScriptMessageHandler {
        weak var model: PlayerModel?
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            DispatchQueue.main.async { [weak self] in self?.model?.receive(body) }
        }
    }

    private func setUpYouTube(_ id: String) {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let b = Bridge()
        b.model = self
        bridge = b
        config.userContentController.add(b, name: "yt")
        // Inside YouTube's frame: go into picture in picture when the page asks.
        let pipScript = """
        if (location.hostname.indexOf('youtube') >= 0) {
          window.addEventListener('message', function (e) {
            if (!e.data || !e.data.jacePip) return;
            var v = document.querySelector('video');
            if (!v) return;
            try {
              if (v.webkitSetPresentationMode) v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
              else if (v.requestPictureInPicture) v.requestPictureInPicture();
            } catch (err) {}
          });
        }
        """
        config.userContentController.addUserScript(WKUserScript(source: pipScript, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        web.isUserInteractionEnabled = false // every touch goes to Jace Media's controls
        let q = quality
        let html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
        <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
        /* Taller than the box, so YouTube's title bar and logo sit outside it. */
        #w{position:absolute;left:0;right:0;top:-12%;bottom:-12%}#w iframe,#p{width:200%;height:200%;border:0;transform:scale(.5);transform-origin:0 0}</style></head>
        <body><div id="w"><div id="p"></div></div>
        <script>
        var player=null,send=function(m){try{webkit.messageHandlers.yt.postMessage(m)}catch(e){}};
        function onYouTubeIframeAPIReady(){
          player=new YT.Player('p',{videoId:'\(id)',host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',
            playerVars:{autoplay:\(wantsPlay ? 1 : 0),controls:0,disablekb:1,fs:0,rel:0,modestbranding:1,iv_load_policy:3,playsinline:1,cc_load_policy:0,origin:location.origin\(q != "default" ? ",vq:'\(q)'" : "")},
            events:{
              onReady:function(e){send({ready:1,d:e.target.getDuration()});\(wantsPlay ? "e.target.playVideo();" : "")},
              onStateChange:function(e){send({state:e.data})},
              onError:function(e){send({error:e.data})}
            }});
          setInterval(function(){if(player&&player.getCurrentTime)send({t:player.getCurrentTime(),d:player.getDuration(),b:player.getVideoLoadedFraction()})},400);
        }
        function pip(){var f=document.querySelector('iframe');if(f&&f.contentWindow)f.contentWindow.postMessage({jacePip:1},'*')}
        function cc(on){try{if(!on){player.unloadModule('captions');return}player.loadModule('captions');setTimeout(function(){var l=player.getOption('captions','tracklist')||[],t=null;for(var i=0;i<l.length;i++)if(l[i].languageCode.indexOf('en')==0){t=l[i];break}t=t||l[0];if(t)player.setOption('captions','track',{languageCode:t.languageCode})},600)}catch(e){}}
        </script><script src="https://www.youtube.com/iframe_api"></script></body></html>
        """
        web.loadHTMLString(html, baseURL: site)
        self.web = web
    }

    fileprivate func receive(_ m: [String: Any]) {
        if m["ready"] != nil { ready = true }
        if let t = m["t"] as? Double { time = t }
        if let d = m["d"] as? Double, d > 0 { duration = d }
        if let b = m["b"] as? Double { buffered = b }
        if let s = m["state"] as? Int {
            // 1 playing, 2 paused, 3 buffering, 0 ended
            playing = s == 1 || s == 3
            waiting = s == 3
            if s == 1 { ready = true; ended = false }
            if s == 0 {
                if loop { js("player.seekTo(0,true);player.playVideo()") } else { ended = true }
            }
        }
        if m["error"] != nil { error = "YouTube won't play this video here." }
    }

    private func js(_ code: String) {
        web?.evaluateJavaScript("try{\(code)}catch(e){}", completionHandler: nil)
    }

    // ----- Controls -----

    func play() {
        ended = false
        if let av { av.play(); av.rate = Float(rate) } else { js("player.playVideo()") }
        playing = true
    }

    func pause() {
        if let av { av.pause() } else { js("player.pauseVideo()") }
        playing = false
    }

    func toggle() { playing ? pause() : play() }

    func attachPiP(_ layer: AVPlayerLayer) {
        guard pip == nil, AVPictureInPictureController.isPictureInPictureSupported() else { return }
        let c = AVPictureInPictureController(playerLayer: layer)
        c?.canStartPictureInPictureAutomaticallyFromInline = true
        pip = c
    }

    /// Picture in picture: Apple's for Jace videos; for YouTube, asks YouTube's video to go into it.
    func startPiP() {
        if let pip {
            pip.isPictureInPictureActive ? pip.stopPictureInPicture() : pip.startPictureInPicture()
        } else if isYouTube {
            js("pip()")
        }
    }

    func seek(to t: Double) {
        let to = max(0, min(t, duration > 0 ? duration - 0.5 : t))
        time = to
        if let av { av.seek(to: CMTime(seconds: to, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) } else { js("player.seekTo(\(to),true)") }
    }

    func skip(_ by: Double) { seek(to: time + by) }

    func setRate(_ r: Double) {
        rate = r
        if let av { if playing { av.rate = Float(r) } } else { js("player.setPlaybackRate(\(r))") }
    }

    func setQuality(_ q: String) {
        quality = q
        UserDefaults.standard.set(q, forKey: "quality")
        if case let .youtube(id) = kind {
            js("var a=player.getCurrentTime();player.setPlaybackQuality('\(q)');player.loadVideoById({videoId:'\(id)',startSeconds:a,suggestedQuality:'\(q)'})")
        } else if let item = av?.currentItem {
            // Apple's engine: a cap on the picture size (Auto has none).
            let h: Double = ["hd2160": 2160, "hd1440": 1440, "hd1080": 1080, "hd720": 720, "large": 480, "medium": 360, "small": 240][q] ?? 0
            item.preferredMaximumResolution = h > 0 ? CGSize(width: h * 16 / 9, height: h) : .zero
        }
    }

    func setCaptions(_ on: Bool) {
        captions = on
        if isYouTube {
            js("cc(\(on ? "true" : "false"))")
        } else if let item = av?.currentItem, let group = item.asset.mediaSelectionGroup(forMediaCharacteristic: .legible) {
            item.select(on ? group.options.first : nil, in: group)
        }
    }
}

/// Apple's engine's picture.
struct AVLayerView: UIViewRepresentable {
    let player: AVPlayer
    var onLayer: (AVPlayerLayer) -> Void = { _ in }

    final class LayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> LayerView {
        let v = LayerView()
        v.backgroundColor = .black
        v.playerLayer.player = player
        v.playerLayer.videoGravity = .resizeAspect
        onLayer(v.playerLayer)
        return v
    }

    func updateUIView(_ uiView: LayerView, context: Context) {
        uiView.playerLayer.player = player
    }
}

/// YouTube's engine's picture (it never gets touches).
struct WebLayerView: UIViewRepresentable {
    let web: WKWebView
    func makeUIView(context: Context) -> WKWebView { web }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Just the picture: Shorts use this with their own taps.
struct PlayerSurface: View {
    @ObservedObject var model: PlayerModel

    var body: some View {
        ZStack {
            Color.black
            if let av = model.av {
                AVLayerView(player: av) { model.attachPiP($0) }
            } else if let web = model.web {
                WebLayerView(web: web)
            }
        }
    }
}

let qualities: [(String, String)] = [
    ("default", "Auto"), ("hd2160", "4K"), ("hd1440", "1440p"), ("hd1080", "1080p"), ("hd720", "720p"), ("large", "480p"), ("medium", "360p"), ("small", "240p"),
]

func clock(_ s: Double) -> String {
    guard s.isFinite, s >= 0 else { return "0:00" }
    let t = Int(s)
    return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, t / 60 % 60, t % 60) : String(format: "%d:%02d", t / 60, t % 60)
}

/// The full player: the picture plus Jace Media's glass controls.
struct JacePlayerView: View {
    @ObservedObject var model: PlayerModel
    var title: String = ""
    @Binding var fullscreen: Bool
    @State private var controls = true
    @State private var hide: DispatchWorkItem?
    @State private var scrub: Double?
    @State private var flash: String?

    var body: some View {
        ZStack {
            PlayerSurface(model: model)

            // Taps: one shows or hides the controls, two on a side skip 10 seconds.
            HStack(spacing: 0) {
                tapZone(-10)
                tapZone(10)
            }

            // Jace Media's play sign; while paused it also covers YouTube's own.
            if !model.playing || flash != nil || !model.ready {
                centerButton
            }

            if controls || !model.playing {
                controlsLayer.transition(.opacity)
            }

            if let error = model.error {
                Text(error).font(.subheadline).foregroundStyle(.white).padding().frame(maxWidth: .infinity, maxHeight: .infinity).background(.black.opacity(0.85))
            }
        }
        .background(Color.black)
        .animation(.easeOut(duration: 0.2), value: controls)
        .onChange(of: model.playing) { _, playing in
            flashSign(playing ? "pause.fill" : "play.fill")
            if playing { scheduleHide() }
        }
    }

    private func tapZone(_ by: Double) -> some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture(count: 2) {
                model.skip(by)
                flashSign(by < 0 ? "gobackward.10" : "goforward.10")
            }
            .onTapGesture {
                controls.toggle()
                if controls { scheduleHide() }
            }
    }

    private var centerButton: some View {
        Group {
            if model.waiting && model.playing || !model.ready {
                ProgressView().tint(.white).controlSize(.large)
                    .frame(width: 84, height: 84)
                    .background(Circle().fill(jaceBackground))
            } else {
                Button {
                    if model.ended { model.seek(to: 0) }
                    model.toggle()
                } label: {
                    Image(systemName: model.ended ? "arrow.counterclockwise" : flash ?? (model.playing ? "pause.fill" : "play.fill"))
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 84, height: 84)
                        // Solid, so YouTube's own sign never shows through.
                        .background(Circle().fill(jaceBackground))
                        .overlay(Circle().stroke(.white.opacity(0.18), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var controlsLayer: some View {
        VStack(spacing: 0) {
            HStack {
                if fullscreen {
                    Button { fullscreen = false } label: { Image(systemName: "chevron.down").frame(width: 40, height: 40) }
                        .glassCircle()
                    Text(title).font(.subheadline.weight(.semibold)).lineLimit(1)
                }
                Spacer()
                Button { model.startPiP() } label: {
                    Image(systemName: "pip.enter").font(.system(size: 15, weight: .semibold)).frame(width: 40, height: 40)
                }
                .glassCircle()
                settingsMenu
            }
            .padding(10)
            Spacer()
            VStack(spacing: 6) {
                seekBar
                HStack {
                    Text("\(clock(scrub ?? model.time)) / \(clock(model.duration))").font(.caption.monospacedDigit())
                    Spacer()
                    Button { model.skip(-10) } label: { Image(systemName: "gobackward.10").frame(width: 36, height: 36) }
                    Button { model.skip(10) } label: { Image(systemName: "goforward.10").frame(width: 36, height: 36) }
                    Button { fullscreen.toggle() } label: {
                        Image(systemName: fullscreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right").frame(width: 36, height: 36)
                    }
                }
                .font(.system(size: 15, weight: .semibold))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .glass(in: RoundedRectangle(cornerRadius: 20))
            .padding(8)
        }
        .foregroundStyle(.white)
        .background(LinearGradient(colors: [.black.opacity(0.35), .clear, .clear, .black.opacity(0.45)], startPoint: .top, endPoint: .bottom).allowsHitTesting(false))
    }

    private var seekBar: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let frac = model.duration > 0 ? (scrub ?? model.time) / model.duration : 0
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.2)).frame(height: 4)
                Capsule().fill(.white.opacity(0.35)).frame(width: w * model.buffered, height: 4)
                Capsule().fill(jaceGreen).frame(width: max(0, w * frac), height: 4)
                Circle().fill(jaceGreen).frame(width: scrub == nil ? 12 : 18).offset(x: max(0, w * frac - (scrub == nil ? 6 : 9)))
            }
            .frame(height: 24)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        hide?.cancel()
                        scrub = max(0, min(1, g.location.x / w)) * model.duration
                    }
                    .onEnded { _ in
                        if let s = scrub { model.seek(to: s) }
                        scrub = nil
                        scheduleHide()
                    }
            )
        }
        .frame(height: 24)
    }

    private var settingsMenu: some View {
        Menu {
            Menu {
                ForEach([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], id: \.self) { r in
                    Button { model.setRate(r) } label: {
                        if model.rate == r { Label(r == 1 ? "Normal" : "\(r.formatted())×", systemImage: "checkmark") } else { Text(r == 1 ? "Normal" : "\(r.formatted())×") }
                    }
                }
            } label: { Label("Speed", systemImage: "speedometer") }
            Menu {
                ForEach(qualities, id: \.0) { q in
                    Button { model.setQuality(q.0) } label: {
                        if model.quality == q.0 { Label(q.1, systemImage: "checkmark") } else { Text(q.1) }
                    }
                }
            } label: { Label("Quality", systemImage: "sparkles.tv") }
            Button { model.setCaptions(!model.captions) } label: {
                Label(model.captions ? "Turn captions off" : "Turn captions on", systemImage: model.captions ? "captions.bubble.fill" : "captions.bubble")
            }
        } label: {
            Image(systemName: "gearshape.fill").font(.system(size: 15, weight: .semibold)).frame(width: 40, height: 40)
        }
        .glassCircle()
    }

    private func flashSign(_ name: String) {
        flash = name
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { if flash == name { flash = nil } }
    }

    private func scheduleHide() {
        hide?.cancel()
        let work = DispatchWorkItem { if model.playing { controls = false } }
        hide = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: work)
    }
}
