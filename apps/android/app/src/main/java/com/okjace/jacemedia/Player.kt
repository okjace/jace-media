package com.okjace.jacemedia

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Jace Media's own player: Jace videos and files play in Media3 (ExoPlayer), YouTube videos
 * in YouTube's engine hidden behind Jace Media's controls (no YouTube buttons, title, or play sign).
 */
class JacePlayer(context: Context, val youtubeId: String?, val url: String?, val loop: Boolean, autoplay: Boolean = true) {
    var time by mutableDoubleStateOf(0.0)
    var duration by mutableDoubleStateOf(0.0)
    var buffered by mutableFloatStateOf(0f)
    var playing by mutableStateOf(false)
    var waiting by mutableStateOf(true)
    var ready by mutableStateOf(false)
    var ended by mutableStateOf(false)
    var rate by mutableFloatStateOf(1f)
    var quality by mutableStateOf(prefs(context).getString("quality", "default") ?: "default")
    var captions by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    private val main = Handler(Looper.getMainLooper())
    private val appContext = context.applicationContext
    val exo: ExoPlayer? = url?.let {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(it))
            repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            playWhenReady = autoplay
            prepare()
        }
    }
    var web: WebView? = null
        private set

    private val ticker = object : Runnable {
        override fun run() {
            exo?.let { p ->
                time = p.currentPosition / 1000.0
                if (p.duration > 0) duration = p.duration / 1000.0
                buffered = if (p.duration > 0) p.bufferedPosition.toFloat() / p.duration else 0f
            }
            main.postDelayed(this, 300)
        }
    }

    init {
        exo?.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying || (exo.playWhenReady && exo.playbackState == Player.STATE_BUFFERING) }
            override fun onPlaybackStateChanged(state: Int) {
                waiting = state == Player.STATE_BUFFERING
                if (state == Player.STATE_READY) ready = true
                if (state == Player.STATE_ENDED && !loop) { ended = true; playing = false }
            }
            override fun onPlayerError(e: androidx.media3.common.PlaybackException) { error = "This video can't be played right now." }
        })
        if (exo != null) main.post(ticker)
        if (youtubeId != null) web = makeWeb(context, youtubeId, autoplay)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun makeWeb(context: Context, id: String, autoplay: Boolean): WebView {
        val q = quality
        val html = """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
            <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
            #w{position:absolute;left:0;right:0;top:-12%;bottom:-12%}#w iframe,#p{width:200%;height:200%;border:0;transform:scale(.5);transform-origin:0 0}</style></head>
            <body><div id="w"><div id="p"></div></div>
            <script>
            var player=null,send=function(m){try{JaceBridge.post(JSON.stringify(m))}catch(e){}};
            function onYouTubeIframeAPIReady(){
              player=new YT.Player('p',{videoId:'$id',host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',
                playerVars:{autoplay:${if (autoplay) 1 else 0},controls:0,disablekb:1,fs:0,rel:0,modestbranding:1,iv_load_policy:3,playsinline:1,cc_load_policy:0,origin:location.origin${if (q != "default") ",vq:'$q'" else ""}},
                events:{
                  onReady:function(e){send({ready:1,d:e.target.getDuration()});${if (autoplay) "e.target.playVideo();" else ""}},
                  onStateChange:function(e){send({state:e.data})},
                  onError:function(e){send({error:e.data})}
                }});
              setInterval(function(){if(player&&player.getCurrentTime)send({t:player.getCurrentTime(),d:player.getDuration(),b:player.getVideoLoadedFraction()})},400);
            }
            function cc(on){try{if(!on){player.unloadModule('captions');return}player.loadModule('captions');setTimeout(function(){var l=player.getOption('captions','tracklist')||[],t=null;for(var i=0;i<l.length;i++)if(l[i].languageCode.indexOf('en')==0){t=l[i];break}t=t||l[0];if(t)player.setOption('captions','track',{languageCode:t.languageCode})},600)}catch(e){}}
            </script><script src="https://www.youtube.com/iframe_api"></script></body></html>
        """.trimIndent()
        return WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.domStorageEnabled = true
            webChromeClient = WebChromeClient()
            setBackgroundColor(android.graphics.Color.BLACK)
            // Every touch goes to Jace Media's controls, never to YouTube's player.
            setOnTouchListener { _, _ -> true }
            addJavascriptInterface(object {
                @JavascriptInterface
                fun post(message: String) {
                    main.post { receive(message) }
                }
            }, "JaceBridge")
            loadDataWithBaseURL(Api.site, html, "text/html", "utf-8", null)
        }
    }

    private fun receive(message: String) {
        val m = runCatching { Api.json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return
        fun num(k: String) = (m[k])?.jsonPrimitive?.doubleOrNull
        if (m.containsKey("ready")) ready = true
        num("t")?.let { time = it }
        num("d")?.let { if (it > 0) duration = it }
        num("b")?.let { buffered = it.toFloat() }
        m["state"]?.jsonPrimitive?.intOrNull?.let { s ->
            playing = s == 1 || s == 3
            waiting = s == 3
            if (s == 1) { ready = true; ended = false }
            if (s == 0) { if (loop) js("player.seekTo(0,true);player.playVideo()") else ended = true }
        }
        if (m.containsKey("error")) error = "YouTube won't play this video here."
    }

    private fun js(code: String) { web?.evaluateJavascript("try{$code}catch(e){}", null) }

    fun play() {
        ended = false
        if (exo != null) { if (exo.playbackState == Player.STATE_ENDED) exo.seekTo(0); exo.play() } else js("player.playVideo()")
        playing = true
    }

    fun pause() {
        if (exo != null) exo.pause() else js("player.pauseVideo()")
        playing = false
    }

    fun toggle() = if (playing) pause() else play()

    fun seek(to: Double) {
        val t = to.coerceIn(0.0, if (duration > 0) duration - 0.5 else to)
        time = t
        if (exo != null) exo.seekTo((t * 1000).toLong()) else js("player.seekTo($t,true)")
    }

    fun skip(by: Double) = seek(time + by)

    fun setSpeed(r: Float) {
        rate = r
        if (exo != null) exo.playbackParameters = PlaybackParameters(r) else js("player.setPlaybackRate($r)")
    }

    fun setVideoQuality(q: String) {
        quality = q
        prefs(appContext).edit().putString("quality", q).apply()
        if (youtubeId != null) {
            js("var a=player.getCurrentTime();player.setPlaybackQuality('$q');player.loadVideoById({videoId:'$youtubeId',startSeconds:a,suggestedQuality:'$q'})")
        } else if (exo != null) {
            val h = mapOf("hd2160" to 2160, "hd1440" to 1440, "hd1080" to 1080, "hd720" to 720, "large" to 480, "medium" to 360, "small" to 240)[q]
            exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
                .setMaxVideoSize(if (h != null) h * 16 / 9 else Int.MAX_VALUE, h ?: Int.MAX_VALUE).build()
        }
    }

    fun setCaptionsOn(on: Boolean) {
        captions = on
        if (youtubeId != null) js("cc($on)")
        else exo?.let {
            it.trackSelectionParameters = it.trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(androidx.media3.common.C.TRACK_TYPE_TEXT, !on).build()
        }
    }

    fun release() {
        main.removeCallbacksAndMessages(null)
        exo?.release()
        web?.destroy()
        web = null
    }

    companion object {
        fun prefs(context: Context) = context.getSharedPreferences("jacemedia", Context.MODE_PRIVATE)
    }
}

/** Picture in picture: which player the floating window shows, and whether it's up. */
object Pip {
    var inPip by mutableStateOf(false)
    var player: JacePlayer? = null

    fun enter(activity: android.app.Activity?): Boolean {
        activity ?: return false
        if (android.os.Build.VERSION.SDK_INT < 26) return false
        if (player == null) return false
        return runCatching { activity.enterPictureInPictureMode(params()) }.getOrDefault(false)
    }

    @androidx.annotation.RequiresApi(26)
    fun params(auto: Boolean = false): android.app.PictureInPictureParams {
        val b = android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational(16, 9))
        if (android.os.Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(auto).setSeamlessResizeEnabled(true)
        return b.build()
    }
}

fun Context.findActivity(): android.app.Activity? {
    var c: Context? = this
    while (c is android.content.ContextWrapper) {
        if (c is android.app.Activity) return c
        c = c.baseContext
    }
    return null
}

@Composable
fun rememberJacePlayer(youtubeId: String?, url: String?, loop: Boolean = false, autoplay: Boolean = true): JacePlayer {
    val context = LocalContext.current
    val player = remember(youtubeId, url) { JacePlayer(context, youtubeId, url, loop, autoplay) }
    DisposableEffect(player) { onDispose { if (Pip.player === player) Pip.player = null; player.release() } }
    // Leaving the app pauses, unless the video went into picture in picture.
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { if (context.findActivity()?.isInPictureInPictureMode != true) player.pause() }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { player.pause() }
    return player
}

/** Just the picture. */
@Composable
fun PlayerSurface(player: JacePlayer, modifier: Modifier = Modifier) {
    Box(modifier.background(Color.Black)) {
        val exo = player.exo
        val web = player.web
        if (exo != null) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        this.player = exo
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        } else if (web != null) {
            AndroidView(
                factory = { (web.parent as? ViewGroup)?.removeView(web); web },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

val Qualities = listOf("default" to "Auto", "hd2160" to "4K", "hd1440" to "1440p", "hd1080" to "1080p", "hd720" to "720p", "large" to "480p", "medium" to "360p", "small" to "240p")

fun clock(s: Double): String {
    if (s.isNaN() || s < 0) return "0:00"
    val t = s.toLong()
    return if (t >= 3600) "%d:%02d:%02d".format(t / 3600, t / 60 % 60, t % 60) else "%d:%02d".format(t / 60, t % 60)
}

/** The full player: the picture plus Jace Media's controls. */
@Composable
fun JacePlayerView(player: JacePlayer, fullscreen: Boolean, onFullscreen: (Boolean) -> Unit, modifier: Modifier = Modifier, title: String = "") {
    val context = LocalContext.current
    // In the floating window: just the picture.
    if (Pip.inPip && Pip.player === player) {
        PlayerSurface(player, modifier.fillMaxSize())
        return
    }
    var controls by remember { mutableStateOf(true) }
    var poke by remember { mutableIntStateOf(0) }
    var flash by remember { mutableStateOf<String?>(null) }
    var scrub by remember { mutableStateOf<Double?>(null) }
    var menu by remember { mutableStateOf(false) }

    LaunchedEffect(player.playing, poke, menu) {
        if (player.playing && !menu) {
            delay(3000)
            controls = false
        }
    }
    LaunchedEffect(player.playing) {
        flash = if (player.playing) "pause" else "play"
        delay(700)
        flash = null
    }

    Box(modifier.background(Color.Black)) {
        PlayerSurface(player, Modifier.fillMaxSize())

        // One tap shows or hides the controls; two taps on a side skip 10 seconds.
        Box(
            Modifier.fillMaxSize().pointerInput(player) {
                detectTapGestures(
                    onTap = { controls = !controls; poke++ },
                    onDoubleTap = { o ->
                        val back = o.x < size.width / 2f
                        player.skip(if (back) -10.0 else 10.0)
                        flash = if (back) "back" else "fwd"
                    },
                )
            },
        )

        // Jace Media's play sign; solid, so YouTube's own never shows through.
        if (!player.playing || flash != null || !player.ready) {
            Box(Modifier.align(Alignment.Center).size(84.dp).clip(CircleShape).background(Background).border(1.dp, Color.White.copy(alpha = 0.18f), CircleShape)
                .clickable { if (player.ended) player.seek(0.0); player.toggle(); poke++ },
                contentAlignment = Alignment.Center,
            ) {
                if (!player.ready || (player.waiting && player.playing)) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 3.dp, modifier = Modifier.size(36.dp))
                } else {
                    val icon = when {
                        player.ended -> Icons.Filled.Replay
                        flash == "back" -> Icons.Filled.FastRewind
                        flash == "fwd" -> Icons.Filled.FastForward
                        flash == "pause" || (flash == null && player.playing) -> Icons.Filled.Pause
                        else -> Icons.Filled.PlayArrow
                    }
                    Icon(icon, null, tint = Color.White, modifier = Modifier.size(40.dp))
                }
            }
        }

        AnimatedVisibility(controls || !player.playing, enter = fadeIn(), exit = fadeOut(), modifier = Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.35f), Color.Transparent, Color.Transparent, Color.Black.copy(alpha = 0.5f))))) {
                Row(Modifier.fillMaxWidth().padding(8.dp).align(Alignment.TopStart), verticalAlignment = Alignment.CenterVertically) {
                    if (fullscreen) {
                        RoundIcon(Icons.Filled.KeyboardArrowDown, "Exit full screen") { onFullscreen(false) }
                        Text(title, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
                    } else Spacer(Modifier.weight(1f))
                    Box {
                        RoundIcon(Icons.Filled.Settings, "Settings") { menu = true }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            Text("Speed", fontSize = 12.sp, color = Color.White.copy(alpha = 0.6f), modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp))
                            Row(Modifier.padding(horizontal = 8.dp)) {
                                listOf(0.5f, 1f, 1.25f, 1.5f, 2f).forEach { r ->
                                    FilterChip(selected = player.rate == r, onClick = { player.setSpeed(r) }, label = { Text(if (r == 1f) "1×" else "${r}×") }, modifier = Modifier.padding(2.dp))
                                }
                            }
                            HorizontalDivider()
                            Qualities.forEach { (q, label) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    leadingIcon = { if (player.quality == q) Icon(Icons.Filled.Check, null) else Spacer(Modifier.size(24.dp)) },
                                    onClick = { player.setVideoQuality(q); menu = false },
                                )
                            }
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text(if (player.captions) "Turn captions off" else "Turn captions on") },
                                leadingIcon = { Icon(Icons.Filled.ClosedCaption, null) },
                                onClick = { player.setCaptionsOn(!player.captions); menu = false },
                            )
                        }
                    }
                }
                Column(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(8.dp)
                        .clip(RoundedCornerShape(20.dp)).background(Color(0xCC1C1F26)).padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    SeekBar(player, scrub, onScrub = { scrub = it; poke++ }, onDone = { scrub?.let { player.seek(it) }; scrub = null })
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${clock(scrub ?: player.time)} / ${clock(player.duration)}", color = Color.White, fontSize = 12.sp)
                        Spacer(Modifier.weight(1f))
                        IconButton(onClick = { player.skip(-10.0); poke++ }) { Icon(Icons.Filled.Replay10, "Back 10 seconds", tint = Color.White) }
                        IconButton(onClick = { player.skip(10.0); poke++ }) { Icon(Icons.Filled.Forward10, "Forward 10 seconds", tint = Color.White) }
                        if (android.os.Build.VERSION.SDK_INT >= 26) IconButton(onClick = { Pip.player = player; Pip.enter(context.findActivity()) }) {
                            Icon(Icons.Filled.PictureInPictureAlt, "Picture in picture", tint = Color.White)
                        }
                        IconButton(onClick = { onFullscreen(!fullscreen) }) {
                            Icon(if (fullscreen) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen, "Full screen", tint = Color.White)
                        }
                    }
                }
            }
        }

        player.error?.let {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f)), contentAlignment = Alignment.Center) { Text(it, color = Color.White) }
        }
    }
}

@Composable
private fun SeekBar(player: JacePlayer, scrub: Double?, onScrub: (Double) -> Unit, onDone: () -> Unit) {
    val frac = if (player.duration > 0) ((scrub ?: player.time) / player.duration).toFloat().coerceIn(0f, 1f) else 0f
    Box(
        Modifier.fillMaxWidth().height(26.dp)
            .pointerInput(player) {
                detectTapGestures { o -> onScrub((o.x / size.width).coerceIn(0f, 1f) * player.duration); onDone() }
            }
            .pointerInput(player) {
                detectHorizontalDragGestures(
                    onDragEnd = onDone,
                    onDragCancel = onDone,
                ) { change, _ -> onScrub((change.position.x / size.width).coerceIn(0f, 1f) * player.duration) }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f)))
        Box(Modifier.fillMaxWidth(player.buffered.coerceIn(0f, 1f)).height(4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.35f)))
        Box(Modifier.fillMaxWidth(frac).height(4.dp).clip(CircleShape).background(Green))
        Box(Modifier.fillMaxWidth(frac).wrapContentWidth(Alignment.End)) {
            Box(Modifier.size(if (scrub != null) 18.dp else 12.dp).clip(CircleShape).background(Green))
        }
    }
}

@Composable
fun RoundIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(Color(0x991C1F26)).border(1.dp, Color.White.copy(alpha = 0.12f), CircleShape).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, label, tint = Color.White, modifier = Modifier.size(20.dp)) }
}
