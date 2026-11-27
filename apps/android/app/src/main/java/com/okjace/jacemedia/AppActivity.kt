package com.okjace.jacemedia

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Comment
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.ThumbDown
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import coil.compose.AsyncImage
import kotlinx.coroutines.launch

/**
 * Jace Media for Android phones and tablets, all native (Jetpack Compose) on Jace Media's app API.
 * Videos (YouTube's too) play in Jace Media's own player. Only going live (and signing in) opens
 * the site, full screen without its bars.
 */
class AppActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { JaceTheme { App() } }
    }

    // Leaving the app while a video plays puts it in a floating window.
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (android.os.Build.VERSION.SDK_INT in 26..30 && Pip.player?.playing == true) Pip.enter(this)
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: android.content.res.Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        Pip.inPip = isInPictureInPictureMode
    }

    override fun onResume() {
        super.onResume()
        // Coming back from signing in (or adding an account) in the web screen.
        Session.refresh()
    }
}

val Green = Color(0xFF3DDC84)
val Background = Color(0xFF111317)
val Panel = Color(0xFF1C1F26)
val Muted = Color.White.copy(alpha = 0.58f)

@Composable
fun JaceTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(primary = Green, onPrimary = Color(0xFF0C1410), background = Background, surface = Background, surfaceVariant = Panel, surfaceContainer = Panel),
        content = content,
    )
}

/** Who's signed in, and who they follow ("kind:ref", lowercase). */
object Session {
    var signedIn by mutableStateOf(Api.signedIn())
    var me by mutableStateOf<Me?>(null)
    var following by mutableStateOf(setOf<String>())
    var version by mutableIntStateOf(0)
    private val scope = kotlinx.coroutines.MainScope()

    fun refresh() {
        signedIn = Api.signedIn()
        scope.launch {
            me = runCatching { Api.get<Me>("/api/app/me") }.getOrNull()
            following = if (signedIn) runCatching { Api.get<FollowingResponse>("/api/app/following").following.toSet() }.getOrDefault(emptySet()) else emptySet()
            version++
        }
    }

    fun isFollowing(kind: String, ref: String) = following.contains("$kind:${ref.lowercase()}")

    suspend fun toggleFollow(kind: String, ref: String, name: String, picture: String?) {
        val key = "$kind:${ref.lowercase()}"
        val on = !following.contains(key)
        following = if (on) following + key else following - key
        val ok = Api.send("/api/subscriptions", mapOf("kind" to kind, "ref" to ref, "name" to name, "picture" to picture), if (on) "POST" else "DELETE")
        if (!ok) following = if (on) following - key else following + key
    }

    suspend fun switchTo(sub: String) {
        val a = runCatching { Api.post<SessionAnswer>("/api/app/session", mapOf("action" to "switch", "sub" to sub)) }.getOrNull() ?: return
        Api.keepSession(a.session)
        refresh()
    }

    suspend fun remove(sub: String) {
        val a = runCatching { Api.post<SessionAnswer>("/api/app/session", mapOf("action" to "remove", "sub" to sub)) }.getOrNull() ?: return
        Api.keepSession(a.session)
        refresh()
    }
}

/** Opens a page of the site full screen, without its bars (signing in, going live). */
fun openWeb(context: Context, path: String) {
    val p = if (path.startsWith("/api/")) path else path + (if (path.contains("?")) "&" else "?") + "app=1"
    context.startActivity(Intent(context, WebScreenActivity::class.java).putExtra("path", p))
}

fun signIn(context: Context, add: Boolean = false) = openWeb(context, "/api/auth/signin?${if (add) "mode=add&" else ""}next=/api/app/done")

private data class TabItem(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val tabs = listOf(
    TabItem("home", "Home", Icons.Filled.Home),
    TabItem("shorts", "Shorts", Icons.Filled.Slideshow),
    TabItem("new", "New", Icons.Filled.AddCircle),
    TabItem("subs", "Subscriptions", Icons.Filled.Subscriptions),
    TabItem("search", "Search", Icons.Filled.Search),
    TabItem("you", "You", Icons.Filled.AccountCircle),
)

@Composable
fun App() {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route ?: "home"
    LaunchedEffect(Unit) { Session.refresh() }
    var showNew by remember { mutableStateOf(false) }
    if (showNew) NewSheet(nav) { showNew = false }
    Scaffold(
        containerColor = Background,
        bottomBar = {
            if (tabs.any { it.route == route } && !Pip.inPip) {
                NavigationBar(containerColor = Color(0xFF0E1013)) {
                    tabs.forEach { t ->
                        NavigationBarItem(
                            selected = route == t.route,
                            onClick = {
                                if (t.route == "new") { showNew = true; return@NavigationBarItem }
                                nav.navigate(t.route) {
                                    popUpTo("home") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(t.icon, contentDescription = t.label) },
                            label = { Text(t.label, fontSize = 11.sp) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(padding)) {
            composable("home") { HomeScreen(nav) }
            composable("shorts") { ShortsScreen(nav) }
            composable("subs") { SubsScreen(nav) }
            composable("search") { SearchScreen(nav) }
            composable("you") { YouScreen(nav) }
            composable("watch/{source}/{id}") { e -> WatchScreen(nav, e.arguments?.getString("source") ?: "youtube", e.arguments?.getString("id") ?: "") }
            composable("channel/{id}") { e -> ChannelScreen(nav, e.arguments?.getString("id") ?: "") }
            composable("post/{network}/{id}") { e -> PostScreen(nav, e.arguments?.getString("network") ?: "jace", e.arguments?.getString("id") ?: "") }
            composable("posts") { PostsScreen(nav) }
            composable("notifications") { NotificationsScreen(nav) }
            composable("library") { LibraryScreen(nav) }
            composable("playlist/{id}") { e -> PlaylistScreen(nav, e.arguments?.getString("id") ?: "") }
            composable("history") { HistoryScreen(nav) }
            composable("live") { LiveScreen(nav) }
            composable("feeds") { FeedsScreen(nav) }
            composable("feed/{id}/{name}") { e -> FeedScreen(nav, e.arguments?.getString("id") ?: "", e.arguments?.getString("name") ?: "") }
            composable("myvideos") { MyVideosScreen(nav) }
            composable("upload") { UploadScreen(nav) }
            composable("compose") { ComposeScreen(nav) }
            composable("accounts") { AccountsScreen(nav) }
            composable("settings") { SettingsScreen(nav) }
        }
    }
}

fun NavHostController.watch(v: Video) = navigate("watch/${v.source}/${Uri.encode(v.id)}")
fun NavHostController.channel(id: String) = navigate("channel/${Uri.encode(id)}")
fun NavHostController.post(p: Post) = navigate("post/${p.network}/${Uri.encode(p.id)}")

// ---------- Loading ----------

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ready<T>(val value: T) : Load<T>
    data class Failed(val message: String) : Load<Nothing>
}

@Composable
inline fun <reified T> rememberApi(path: String?, key: Any? = null): Pair<Load<T>, () -> Unit> {
    var state by remember(path, key) { mutableStateOf<Load<T>>(Load.Loading) }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(path, key, tick) {
        if (path == null) return@LaunchedEffect
        state = try {
            Load.Ready(Api.get<T>(path))
        } catch (e: Exception) {
            if (state is Load.Ready) state else Load.Failed(e.message ?: "Couldn't load that.")
        }
    }
    return state to { tick++ }
}

@Composable
fun Spinner() {
    Box(Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Green) }
}

@Composable
fun Failed(message: String, retry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, color = Muted)
        Spacer(Modifier.height(12.dp))
        Button(onClick = retry) { Text("Try again") }
    }
}

@Composable
fun Pill(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector? = null, on: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(if (on) Green.copy(alpha = 0.18f) else Panel).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, null, tint = if (on) Green else Color.White, modifier = Modifier.size(18.dp))
        if (icon != null && text.isNotEmpty()) Spacer(Modifier.width(6.dp))
        if (text.isNotEmpty()) Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (on) Green else Color.White)
    }
}

// ---------- Pieces ----------

@Composable
fun Avatar(name: String, picture: String?, size: Int = 36) {
    if (picture != null) {
        AsyncImage(model = picture, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size.dp).clip(CircleShape).background(Panel))
    } else {
        Box(Modifier.size(size.dp).clip(CircleShape).background(Green.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
            Text(name.take(1).uppercase(), color = Green, fontWeight = FontWeight.Bold, fontSize = (size * 0.45).sp)
        }
    }
}

/**
 * A channel (or person) you can press and hold: Subscribe / Unsubscribe and Go to channel.
 * There are no Subscribe buttons anywhere else.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ChannelHold(
    nav: NavHostController,
    kind: String,
    ref: String,
    name: String,
    picture: String?,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    Box(modifier.combinedClickable(onClick = { onClick?.invoke() ?: run { open = true } }, onLongClick = { open = true })) {
        content()
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (ref.isNotEmpty()) {
                if (Session.signedIn) {
                    val on = Session.isFollowing(kind, ref)
                    DropdownMenuItem(
                        text = { Text(if (on) "Unsubscribe from $name" else "Subscribe to $name") },
                        leadingIcon = { Icon(if (on) Icons.Filled.CheckCircle else Icons.Filled.AddCircle, null) },
                        onClick = { open = false; scope.launch { Session.toggleFollow(kind, ref, name, picture) } },
                    )
                } else {
                    DropdownMenuItem(text = { Text("Sign in to subscribe") }, leadingIcon = { Icon(Icons.Filled.AccountCircle, null) }, onClick = { open = false; signIn(context) })
                }
            }
            if (kind == "youtube" && ref.isNotEmpty()) {
                DropdownMenuItem(text = { Text("Go to $name") }, leadingIcon = { Icon(Icons.Filled.Person, null) }, onClick = { open = false; nav.channel(ref) })
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun VideoCard(v: Video, nav: NavHostController, modifier: Modifier = Modifier.fillMaxWidth()) {
    var menu by remember { mutableStateOf(false) }
    var hidden by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    if (hidden) return
    Box(modifier) {
        Column(Modifier.fillMaxWidth().combinedClickable(onClick = { nav.watch(v) }, onLongClick = { menu = true }).padding(bottom = 18.dp)) {
            Box {
                AsyncImage(
                    model = v.thumbnail,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(16.dp)).background(Panel),
                )
                Text(
                    if (v.source == "jace") "JACE" else "YOUTUBE",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (v.source == "jace") Color.Black else Color.White,
                    modifier = Modifier.padding(8.dp).background(if (v.source == "jace") Green else Color(0xFFE5484D), RoundedCornerShape(50)).padding(horizontal = 7.dp, vertical = 3.dp),
                )
            }
            Row(Modifier.padding(top = 10.dp)) {
                ChannelHold(nav, v.source, v.channelId, v.channelName, v.channelPicture, onClick = { if (v.source == "youtube" && v.channelId.isNotEmpty()) nav.channel(v.channelId) }) {
                    Avatar(v.channelName, v.channelPicture, 34)
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(v.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Color.White)
                    Text(listOfNotNull(v.channelName, compact(v.views)?.let { "$it views" }, ago(v.publishedAt)).joinToString(" · "), fontSize = 12.sp, color = Muted, maxLines = 1)
                }
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            if (Session.signedIn) {
                DropdownMenuItem(text = { Text("Save to Watch Later") }, leadingIcon = { Icon(Icons.Filled.WatchLater, null) }, onClick = { menu = false; scope.launch { saveToWatchLater(v) } })
                DropdownMenuItem(text = { Text("Not interested") }, leadingIcon = { Icon(Icons.Filled.Block, null) }, onClick = {
                    menu = false; hidden = true; scope.launch { Api.send("/api/hidden", mapOf("kind" to "video", "ref" to "${v.source}:${v.id}")) }
                })
                DropdownMenuItem(text = { Text("Don't recommend channel") }, leadingIcon = { Icon(Icons.Filled.DoNotDisturb, null) }, onClick = {
                    menu = false; hidden = true; scope.launch { Api.send("/api/hidden", mapOf("kind" to "channel", "ref" to "${v.source}:${v.channelId}")) }
                })
                val on = Session.isFollowing(v.source, v.channelId)
                DropdownMenuItem(text = { Text(if (on) "Unsubscribe from ${v.channelName}" else "Subscribe to ${v.channelName}") }, leadingIcon = { Icon(if (on) Icons.Filled.CheckCircle else Icons.Filled.AddCircle, null) }, onClick = {
                    menu = false; scope.launch { Session.toggleFollow(v.source, v.channelId, v.channelName, v.channelPicture) }
                })
            }
            if (v.source == "youtube") DropdownMenuItem(text = { Text("Go to ${v.channelName}") }, leadingIcon = { Icon(Icons.Filled.Person, null) }, onClick = { menu = false; nav.channel(v.channelId) })
            DropdownMenuItem(text = { Text("Share") }, leadingIcon = { Icon(Icons.Filled.Share, null) }, onClick = { menu = false; share(context, "${Api.site}/watch/${v.source}/${v.id}") })
        }
    }
}

suspend fun saveToWatchLater(v: Video) {
    Api.send("/api/playlists/watch-later/items", mapOf("video" to mapOf("source" to v.source, "id" to v.id, "title" to v.title, "thumbnail" to v.thumbnail, "channelId" to v.channelId, "channelName" to v.channelName, "short" to v.short)))
}

fun share(context: Context, url: String) {
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url), "Share"))
}

fun ago(iso: String?): String? {
    iso ?: return null
    val t = runCatching { java.time.Instant.parse(iso).toEpochMilli() }.getOrNull() ?: return null
    return android.text.format.DateUtils.getRelativeTimeSpanString(t, System.currentTimeMillis(), android.text.format.DateUtils.MINUTE_IN_MILLIS).toString()
}

@Composable
fun ShortCard(v: Video, nav: NavHostController) {
    Column(Modifier.width(130.dp).clickable { nav.watch(v) }) {
        AsyncImage(model = v.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(9f / 16f).clip(RoundedCornerShape(16.dp)).background(Panel))
        Text(v.title, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
fun ShortsRow(list: List<Video>, nav: NavHostController) {
    if (list.isEmpty()) return
    Text("Shorts", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 18.dp)) { items(list, key = { it.source + it.id }) { ShortCard(it, nav) } }
}

fun networkName(n: String) = mapOf("bluesky" to "Bluesky", "mastodon" to "Mastodon", "lemmy" to "Lemmy", "hackernews" to "Hacker News", "rss" to "News")[n]

/** A post from anywhere: like, reply, its picture or video (which plays in Jace Media's player). */
@Composable
fun PostCard(p: Post, nav: NavHostController, linked: Boolean = true) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var liked by remember(p.id) { mutableStateOf(p.likedByMe) }
    var likes by remember(p.id) { mutableDoubleStateOf(p.stats?.likes ?: 0.0) }
    Column(
        Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(20.dp)).background(Panel)
            .clickable(enabled = linked) { nav.post(p) }.padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ChannelHold(nav, p.network, p.followRef, p.author.name, p.author.picture, onClick = null) { Avatar(p.author.name, p.author.picture, 38) }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(p.author.name, fontWeight = FontWeight.SemiBold)
                Text(listOfNotNull(if (p.network == "jace") "@${p.author.handle}" else p.author.handle, networkName(p.network), ago(p.createdAt)).joinToString(" · "), fontSize = 12.sp, color = Muted, maxLines = 1)
            }
        }
        p.title?.takeIf { it.isNotBlank() }?.let { Text(it, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
        if (p.text.isNotBlank()) Text(p.text, maxLines = if (linked) 10 else Int.MAX_VALUE, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        val video = p.video
        val clip = p.media.firstOrNull { it.kind == "video" && it.src != null }
        when {
            video != null -> Box(Modifier.padding(top = 10.dp).fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)).clickable { nav.navigate("watch/${video.source}/${Uri.encode(video.id)}") }) {
                AsyncImage(model = video.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().background(Color.Black))
                Box(Modifier.align(Alignment.Center).size(58.dp).clip(CircleShape).background(Background), contentAlignment = Alignment.Center) { Icon(Icons.Filled.PlayArrow, null, tint = Color.White) }
            }
            clip != null -> InlineVideo(clip.src!!, clip.thumb)
            else -> p.media.firstOrNull { it.kind == "image" }?.let { m ->
                AsyncImage(model = m.thumb ?: m.url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.padding(top = 10.dp).fillMaxWidth().heightIn(max = 340.dp).clip(RoundedCornerShape(14.dp)))
            }
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clip(RoundedCornerShape(50)).clickable {
                    if (!Session.signedIn) return@clickable signIn(context)
                    if (p.network != "jace") return@clickable
                    liked = !liked
                    likes += if (liked) 1 else -1
                    scope.launch { Api.send("/api/posts/${p.id}/like", emptyMap(), if (liked) "POST" else "DELETE") }
                }.padding(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(if (liked) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, "Like", tint = if (liked) Color(0xFFFF5A5F) else Muted, modifier = Modifier.size(18.dp))
                compact(likes.takeIf { it > 0 })?.let { Text(" $it", fontSize = 12.sp, color = Muted) }
            }
            Spacer(Modifier.width(14.dp))
            if (linked) Row(Modifier.clip(RoundedCornerShape(50)).clickable { nav.post(p) }.padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Filled.Comment, "Reply", tint = Muted, modifier = Modifier.size(18.dp))
                compact(p.stats?.replies)?.let { Text(" $it", fontSize = 12.sp, color = Muted) }
            }
            Spacer(Modifier.weight(1f))
            p.url?.let { u -> Icon(Icons.Filled.Share, "Share", tint = Muted, modifier = Modifier.size(18.dp).clickable { share(context, if (u.startsWith("/")) Api.site + u else u) }) }
        }
    }
}

/** A video inside a post, in Jace Media's player (it loads when you press play). */
@Composable
fun InlineVideo(src: String, poster: String?) {
    var started by remember(src) { mutableStateOf(false) }
    var fullscreen by remember { mutableStateOf(false) }
    Box(Modifier.padding(top = 10.dp).fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)).background(Color.Black)) {
        if (started) {
            val player = rememberJacePlayer(null, src)
            JacePlayerView(player, fullscreen, { fullscreen = it }, Modifier.fillMaxSize())
        } else {
            AsyncImage(model = poster, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            Box(Modifier.align(Alignment.Center).size(58.dp).clip(CircleShape).background(Background).clickable { started = true }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.PlayArrow, "Play", tint = Color.White)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopBar(title: String, nav: NavHostController? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        navigationIcon = { if (nav != null) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Background),
    )
}

// ---------- Main screens ----------

@Composable
fun HomeScreen(nav: NavHostController) {
    var forYou by rememberSaveable { mutableStateOf(false) }
    val (state, reload) = rememberApi<Home>(if (forYou) "/api/app/home?for=you" else "/api/app/home", Session.version)
    var menu by remember { mutableStateOf(false) }
    Column {
        TopBar("Jace Media") {
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.FilterList, "Feed") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Home") }, leadingIcon = { if (!forYou) Icon(Icons.Filled.Check, null) }, onClick = { forYou = false; menu = false })
                    DropdownMenuItem(text = { Text("For you") }, leadingIcon = { if (forYou) Icon(Icons.Filled.Check, null) }, onClick = { forYou = true; menu = false })
                    DropdownMenuItem(text = { Text("Your feeds") }, leadingIcon = { Icon(Icons.Filled.FilterList, null) }, onClick = { menu = false; nav.navigate("feeds") })
                }
            }
            if (Session.signedIn) {
                IconButton(onClick = { nav.navigate("compose") }) { Icon(Icons.Filled.Edit, "Write a post") }
                IconButton(onClick = { nav.navigate("notifications") }) { Icon(Icons.Filled.Notifications, "Notifications") }
            }
        }
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val h = s.value
                items(h.videos.take(4), key = { "a" + it.source + it.id }) { VideoCard(it, nav) }
                item { ShortsRow(h.shorts, nav) }
                items(h.videos.drop(4).take(8), key = { "b" + it.source + it.id }) { VideoCard(it, nav) }
                if (h.posts.isNotEmpty()) item {
                    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("From people", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text("See all", color = Green, modifier = Modifier.clickable { nav.navigate("posts") })
                    }
                }
                items(h.posts.take(10), key = { "p" + it.network + it.id }) { PostCard(it, nav) }
                items(h.videos.drop(12), key = { "c" + it.source + it.id }) { VideoCard(it, nav) }
            }
        }
    }
}

@Composable
fun ShortsScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<VideoList>("/api/app/shorts")
    var comments by remember { mutableStateOf<Video?>(null) }
    when (val s = state) {
        is Load.Loading -> Spinner()
        is Load.Failed -> Failed(s.message, reload)
        is Load.Ready -> {
            val list = s.value.videos
            val pager = rememberPagerState { list.size }
            VerticalPager(pager, modifier = Modifier.fillMaxSize().background(Color.Black), key = { list[it].source + list[it].id }) { page ->
                ShortPage(list[page], pager.currentPage == page, nav) { comments = list[page] }
            }
        }
    }
    comments?.let { v -> CommentsSheet(v.source, v.id, v.title) { comments = null } }
}

@Composable
fun ShortPage(v: Video, active: Boolean, nav: NavHostController, onComments: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var vote by remember { mutableIntStateOf(0) }
    Box(Modifier.fillMaxSize()) {
        if (active) {
            val player = rememberJacePlayer(if (v.source == "jace" && v.src != null) null else v.id, if (v.source == "jace") v.src else null, loop = true)
            PlayerSurface(player, Modifier.fillMaxSize().clickable { player.toggle() })
            if (!player.playing && player.ready) {
                Box(Modifier.align(Alignment.Center).size(80.dp).clip(CircleShape).background(Background), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.PlayArrow, null, tint = Color.White, modifier = Modifier.size(38.dp))
                }
            }
        } else {
            AsyncImage(model = v.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        Row(
            Modifier.align(Alignment.BottomStart).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f)))).padding(16.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(Modifier.weight(1f)) {
                ChannelHold(nav, v.source, v.channelId, v.channelName, v.channelPicture, onClick = { if (v.source == "youtube") nav.channel(v.channelId) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(v.channelName, v.channelPicture, 32)
                        Spacer(Modifier.width(8.dp))
                        Text(v.channelName, fontWeight = FontWeight.SemiBold, color = Color.White)
                        if (Session.isFollowing(v.source, v.channelId)) Icon(Icons.Filled.CheckCircle, "Subscribed", tint = Green, modifier = Modifier.padding(start = 6.dp).size(16.dp))
                    }
                }
                Text(v.title, color = Color.White, maxLines = 2, modifier = Modifier.padding(top = 6.dp))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                fun setVote(n: Int) {
                    if (!Session.signedIn) return signIn(context)
                    vote = n
                    scope.launch { Api.send("/api/video-likes", mapOf("source" to v.source, "id" to v.id, "channelId" to v.channelId, "value" to n)) }
                }
                SideButton(if (vote == 1) Icons.Filled.ThumbUp else Icons.Outlined.ThumbUp, "Like") { setVote(if (vote == 1) 0 else 1) }
                SideButton(if (vote == -1) Icons.Filled.ThumbDown else Icons.Outlined.ThumbDown, "Dislike") { setVote(if (vote == -1) 0 else -1) }
                SideButton(Icons.AutoMirrored.Filled.Comment, "Comments", onComments)
                SideButton(Icons.Filled.Share, "Share") { share(context, "${Api.site}/shorts?v=${v.source}:${v.id}") }
            }
        }
    }
}

@Composable
fun SideButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(Color(0x991C1F26)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
            Icon(icon, label, tint = Color.White)
        }
        Text(label, color = Color.White, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
    }
}

@Composable
fun SignInPrompt(text: String) {
    val context = LocalContext.current
    Column(Modifier.fillMaxWidth().padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Filled.AccountCircle, null, tint = Green, modifier = Modifier.size(52.dp))
        Text(text, color = Muted, modifier = Modifier.padding(vertical = 14.dp))
        Button(onClick = { signIn(context) }) { Text("Sign in with Jace") }
    }
}

@Composable
fun SubsScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<Subscriptions>(if (Session.signedIn) "/api/app/subscriptions" else null, Session.version)
    Column {
        TopBar("Subscriptions")
        if (!Session.signedIn) return@Column SignInPrompt("Sign in to see videos from the channels and people you follow.")
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val sub = s.value
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(bottom = 18.dp)) {
                        items(sub.channels, key = { it.kind + it.ref }) { c ->
                            ChannelHold(nav, c.kind, c.ref, c.name, c.picture, onClick = { if (c.kind == "youtube") nav.channel(c.ref) }) {
                                Column(Modifier.width(70.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Avatar(c.name, c.picture, 56)
                                    Text(c.name, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                                }
                            }
                        }
                    }
                }
                item { ShortsRow(sub.videos.filter { it.short }, nav) }
                items(sub.videos.filter { !it.short }, key = { it.source + it.id }) { VideoCard(it, nav) }
                if (sub.posts.isNotEmpty()) item { Text("Posts", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)) }
                items(sub.posts, key = { "p" + it.network + it.id }) { PostCard(it, nav) }
                if (sub.videos.isEmpty() && sub.posts.isEmpty()) item { Text("Nothing new from the channels you follow.", color = Muted) }
            }
        }
    }
}

@Composable
fun SearchScreen(nav: NavHostController) {
    var text by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    val (state, reload) = rememberApi<SearchResults>(if (query.isBlank()) null else "/api/app/search?q=${Api.q(query)}")
    Column {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            placeholder = { Text("Search Jace Media") },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            singleLine = true,
            shape = RoundedCornerShape(50),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { query = text.trim() }),
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        )
        if (query.isNotBlank()) when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp)) {
                val r = s.value
                items(r.channels.take(3), key = { "c" + it.id }) { c ->
                    ChannelHold(nav, "youtube", c.id, c.name, c.picture, onClick = { nav.channel(c.id) }) {
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(c.name, c.picture, 52)
                            Spacer(Modifier.width(12.dp))
                            Text(c.name, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                item { ShortsRow(r.shorts, nav) }
                items(r.videos, key = { "v" + it.source + it.id }) { VideoCard(it, nav) }
                items(r.posts, key = { "p" + it.network + it.id }) { PostCard(it, nav) }
            }
        } else {
            Column(Modifier.fillMaxWidth().padding(top = 80.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Filled.Search, null, tint = Muted, modifier = Modifier.size(44.dp))
                Text("Search videos, Shorts, channels, and posts.", color = Muted, modifier = Modifier.padding(top = 10.dp))
            }
        }
    }
}

/** Full screen: landscape, no system bars. */
fun setFullscreen(activity: Activity?, on: Boolean) {
    activity ?: return
    activity.requestedOrientation = if (on) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    val c = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
    if (on) {
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        c.hide(WindowInsetsCompat.Type.systemBars())
    } else c.show(WindowInsetsCompat.Type.systemBars())
}

@Composable
fun WatchScreen(nav: NavHostController, source: String, id: String) {
    val (state, reload) = rememberApi<Watch>("/api/app/watch/$source/${Uri.encode(id)}")
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var vote by remember { mutableIntStateOf(0) }
    var more by remember { mutableStateOf(false) }
    var fullscreen by remember { mutableStateOf(false) }
    var comments by remember { mutableStateOf(false) }

    LaunchedEffect(state) {
        val w = (state as? Load.Ready)?.value ?: return@LaunchedEffect
        vote = w.video.myVote
        if (Session.signedIn) Api.send("/api/history", mapOf("source" to source, "id" to id, "title" to w.video.title, "channelId" to w.video.channelId, "channelName" to w.video.channelName, "thumbnail" to w.video.thumbnail))
    }
    fun full(on: Boolean) {
        fullscreen = on
        setFullscreen(context as? Activity, on)
    }
    BackHandler(fullscreen) { full(false) }
    DisposableEffect(Unit) {
        onDispose {
            setFullscreen(context as? Activity, false)
            if (android.os.Build.VERSION.SDK_INT >= 31) (context as? Activity)?.setPictureInPictureParams(Pip.params(auto = false))
        }
    }

    Column(Modifier.fillMaxSize().background(if (fullscreen || Pip.inPip) Color.Black else Background)) {
        val v = (state as? Load.Ready)?.value?.video
        Box(if (fullscreen || Pip.inPip) Modifier.fillMaxSize() else Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)) {
            if (v != null) {
                val file = v.stream.type == "file" && v.stream.url != null
                val player = rememberJacePlayer(if (file) null else (v.stream.id ?: v.id), if (file) v.stream.url else null)
                LaunchedEffect(player, player.playing) {
                    Pip.player = player
                    if (android.os.Build.VERSION.SDK_INT >= 31) (context as? Activity)?.setPictureInPictureParams(Pip.params(auto = player.playing))
                }
                JacePlayerView(player, fullscreen, { full(it) }, Modifier.fillMaxSize(), v.title)
            } else if (state is Load.Loading) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.align(Alignment.Center))
            }
            if (!fullscreen && !Pip.inPip) Box(Modifier.padding(8.dp)) { RoundIcon(Icons.AutoMirrored.Filled.ArrowBack, "Back") { nav.popBackStack() } }
        }
        if (fullscreen || Pip.inPip) return@Column
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val w = s.value.video
                item {
                    Text(w.title, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    Text(listOfNotNull(compact(w.views)?.let { "$it views" }, if (w.live) "🔴 Live" else null).joinToString(" · "), fontSize = 12.sp, color = Muted, modifier = Modifier.padding(top = 4.dp))
                    val cid = w.channelId
                    if (cid != null) {
                        ChannelHold(nav, w.source, cid, w.channelName, w.channelPicture, onClick = { if (w.source == "youtube") nav.channel(cid) }, modifier = Modifier.padding(vertical = 12.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Avatar(w.channelName, w.channelPicture, 40)
                                Spacer(Modifier.width(10.dp))
                                Column {
                                    Text(w.channelName, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(if (Session.isFollowing(w.source, cid)) "Subscribed · hold to change" else "Hold to subscribe", fontSize = 11.sp, color = Muted)
                                }
                            }
                        }
                    }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        fun setVote(n: Int) {
                            if (!Session.signedIn) return signIn(context)
                            vote = n
                            scope.launch { Api.send("/api/video-likes", mapOf("source" to source, "id" to id, "channelId" to w.channelId, "value" to n)) }
                        }
                        val likes = w.likes?.let { it + (if (vote == 1) 1 else 0) - (if (w.myVote == 1) 1 else 0) }
                        item { Pill(compact(likes) ?: "Like", if (vote == 1) Icons.Filled.ThumbUp else Icons.Outlined.ThumbUp, vote == 1) { setVote(if (vote == 1) 0 else 1) } }
                        item { Pill(compact(w.dislikes) ?: "", if (vote == -1) Icons.Filled.ThumbDown else Icons.Outlined.ThumbDown, vote == -1) { setVote(if (vote == -1) 0 else -1) } }
                        item {
                            Pill("Save", Icons.Filled.WatchLater) {
                                if (!Session.signedIn) return@Pill signIn(context)
                                scope.launch { saveToWatchLater(Video(w.source, w.id, w.title, w.thumbnail, w.channelId ?: "", w.channelName, w.channelPicture)) }
                            }
                        }
                        item { Pill("Share", Icons.Filled.Share) { share(context, "${Api.site}/watch/${w.source}/${w.id}") } }
                    }
                    if (w.description.isNotBlank()) {
                        Text(
                            w.description,
                            maxLines = if (more) Int.MAX_VALUE else 3,
                            overflow = TextOverflow.Ellipsis,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).clickable { more = !more }.padding(12.dp),
                        )
                    }
                    Row(
                        Modifier.padding(vertical = 12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).clickable { comments = true }.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Comment, null)
                        Text("Comments", modifier = Modifier.padding(start = 10.dp).weight(1f), fontWeight = FontWeight.SemiBold)
                        Icon(Icons.Filled.KeyboardArrowUp, null)
                    }
                    Text("Up next", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
                }
                items(s.value.upNext, key = { it.source + it.id }) { VideoCard(it, nav) }
            }
        }
    }
    if (comments) CommentsSheet(source, id, (state as? Load.Ready)?.value?.video?.title ?: "") { comments = false }
}

@Composable
fun ChannelScreen(nav: NavHostController, id: String) {
    val (state, reload) = rememberApi<ChannelPage>("/api/app/channel/youtube/${Uri.encode(id)}")
    Column {
        TopBar((state as? Load.Ready)?.value?.channel?.name ?: "", nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val p = s.value
                item {
                    ChannelHold(nav, "youtube", id, p.channel.name, p.channel.picture, onClick = null, modifier = Modifier.padding(bottom = 18.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Avatar(p.channel.name, p.channel.picture, 64)
                            Spacer(Modifier.width(14.dp))
                            Column {
                                Text(p.channel.name, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                                compact(p.channel.subscribers)?.let { Text("$it subscribers", fontSize = 12.sp, color = Muted) }
                                Text(if (Session.isFollowing("youtube", id)) "Subscribed · hold to change" else "Hold to subscribe", fontSize = 11.sp, color = Muted)
                            }
                        }
                    }
                }
                item { ShortsRow(p.shorts, nav) }
                items(p.videos, key = { it.source + it.id }) { VideoCard(it, nav) }
            }
        }
    }
}

@Composable
fun YouScreen(nav: NavHostController) {
    val context = LocalContext.current
    val account = Session.me?.account
    val (history, _) = rememberApi<HistoryList>(if (Session.signedIn) "/api/app/history" else null, Session.version)
    @Composable
    fun Item(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(vertical = 13.dp, horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = Green)
            Text(label, fontSize = 16.sp, modifier = Modifier.padding(start = 14.dp))
        }
    }
    LazyColumn(contentPadding = PaddingValues(16.dp)) {
        item {
            if (account != null) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Panel).clickable { nav.navigate("accounts") }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(account.name, account.picture, 58)
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(account.name, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("@${account.handle}", color = Muted)
                    }
                    Pill("Switch", Icons.Filled.SwapHoriz) { nav.navigate("accounts") }
                }
                Spacer(Modifier.height(10.dp))
            } else if (!Session.signedIn) {
                SignInPrompt("Sign in with Jace to subscribe, like, post, and keep your history.")
            }
        }
        if (Session.signedIn) {
            item { Text("Make", fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 8.dp)) }
            item { Item("Write a post", Icons.Filled.Edit) { nav.navigate("compose") } }
            item { Item("Upload a video", Icons.Filled.Upload) { nav.navigate("upload") } }
            item { Item("Go live", Icons.Filled.Videocam) { openWeb(context, "/live/go") } }
            item { Item("Your videos", Icons.Filled.VideoLibrary) { nav.navigate("myvideos") } }
            item { Text("Library", fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 8.dp)) }
            item { Item("Library", Icons.Filled.LibraryBooks) { nav.navigate("library") } }
            item { Item("Notifications", Icons.Filled.Notifications) { nav.navigate("notifications") } }
            item { Item("History", Icons.Filled.History) { nav.navigate("history") } }
        }
        item { Text("Explore", fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 8.dp)) }
        item { Item("Live", Icons.Filled.LiveTv) { nav.navigate("live") } }
        item { Item("Posts", Icons.AutoMirrored.Filled.Comment) { nav.navigate("posts") } }
        item { Item("Your feeds", Icons.Filled.FilterList) { nav.navigate("feeds") } }
        item { Item("Settings", Icons.Filled.Settings) { nav.navigate("settings") } }
        if (Session.signedIn) item { Item("Switch account", Icons.Filled.People) { nav.navigate("accounts") } }
        val items = (history as? Load.Ready)?.value?.items.orEmpty()
        if (items.isNotEmpty()) {
            item { Text("Recently watched", fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 14.dp, bottom = 6.dp)) }
            items(items.take(5), key = { "h" + it.source + it.id }) { h ->
                Column(Modifier.fillMaxWidth().clickable { nav.navigate("watch/${h.source}/${Uri.encode(h.id)}") }.padding(vertical = 8.dp)) {
                    Text(h.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    h.channelName?.let { Text(it, fontSize = 12.sp, color = Muted) }
                }
            }
        }
    }
}


/** What you can make: a post, a video, or a live stream. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewSheet(nav: NavHostController, onClose: () -> Unit) {
    val context = LocalContext.current
    ModalBottomSheet(onDismissRequest = onClose, containerColor = Background) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
            Text("New", fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 12.dp))
            if (!Session.signedIn) {
                SignInPrompt("Sign in with Jace to post, upload, and go live.")
                return@Column
            }
            @Composable
            fun NewRow(title: String, sub: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(20.dp)).background(Panel).clickable { onClose(); onClick() }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(44.dp).clip(CircleShape).background(Green), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Color.Black) }
                    Column(Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(title, fontWeight = FontWeight.Bold)
                        Text(sub, fontSize = 12.sp, color = Muted)
                    }
                }
            }
            NewRow("Write a post", "Text and a picture", Icons.Filled.Edit) { nav.navigate("compose") }
            NewRow("Upload a video", "From your phone", Icons.Filled.Upload) { nav.navigate("upload") }
            NewRow("Go live", "Stream your camera or screen", Icons.Filled.Videocam) { openWeb(context, "/live/go") }
        }
    }
}
