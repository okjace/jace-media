package com.okjace.jacemedia

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
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
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import coil.compose.AsyncImage
import kotlinx.coroutines.launch

/**
 * Jace Media for Android phones and tablets, native (Jetpack Compose): Home,
 * Shorts, Subscriptions, Search, and You, Media3 for Jace videos and
 * YouTube's privacy-enhanced player for YouTube. Posting, uploading, going
 * live, and settings open the site (WebScreenActivity), signed in the same way.
 */
class AppActivity : ComponentActivity() {
    private val signedInState = mutableStateOf(Api.signedIn())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { JaceTheme { App(signedIn = signedInState.value) } }
    }

    override fun onResume() {
        super.onResume()
        // Coming back from signing in (or out) in the web screen.
        signedInState.value = Api.signedIn()
    }
}

val Green = Color(0xFF3DDC84)
val Background = Color(0xFF111317)
val Panel = Color(0xFF1C1F26)

@Composable
fun JaceTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(primary = Green, onPrimary = Color(0xFF0C1410), background = Background, surface = Background, surfaceVariant = Panel),
        content = content,
    )
}

/** Opens a page of the site inside the app, signed in. */
fun openWeb(context: Context, path: String) {
    context.startActivity(Intent(context, WebScreenActivity::class.java).putExtra("path", path))
}

private data class TabItem(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val tabs = listOf(
    TabItem("home", "Home", Icons.Filled.Home),
    TabItem("shorts", "Shorts", Icons.Filled.PlayArrow),
    TabItem("subs", "Subscriptions", Icons.AutoMirrored.Filled.List),
    TabItem("search", "Search", Icons.Filled.Search),
    TabItem("you", "You", Icons.Filled.Person),
)

@Composable
fun App(signedIn: Boolean) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route ?: "home"
    Scaffold(
        containerColor = Background,
        bottomBar = {
            if (tabs.any { it.route == route }) {
                NavigationBar(containerColor = Color(0xFF0E1013)) {
                    tabs.forEach { t ->
                        NavigationBarItem(
                            selected = route == t.route,
                            onClick = {
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
            composable("subs") { SubsScreen(nav, signedIn) }
            composable("search") { SearchScreen(nav) }
            composable("you") { YouScreen(nav, signedIn) }
            composable("watch/{source}/{id}") { e ->
                WatchScreen(nav, e.arguments?.getString("source") ?: "youtube", e.arguments?.getString("id") ?: "", signedIn)
            }
            composable("channel/{id}") { e -> ChannelScreen(nav, e.arguments?.getString("id") ?: "") }
        }
    }
}

fun NavHostController.watch(v: Video) = navigate("watch/${v.source}/${Uri.encode(v.id)}")
fun NavHostController.channel(id: String) = navigate("channel/${Uri.encode(id)}")

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
            Load.Failed(e.message ?: "Couldn't load that.")
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
        Text(message, color = Color.White.copy(alpha = 0.6f))
        Spacer(Modifier.height(12.dp))
        Button(onClick = retry) { Text("Try again") }
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

@Composable
fun VideoCard(v: Video, nav: NavHostController) {
    Column(Modifier.fillMaxWidth().clickable { nav.watch(v) }.padding(bottom = 18.dp)) {
        Box {
            AsyncImage(
                model = v.thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp)).background(Panel),
            )
            Text(
                if (v.source == "jace") "JACE" else "YOUTUBE",
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = if (v.source == "jace") Color.Black else Color.White,
                modifier = Modifier.padding(8.dp).background(if (v.source == "jace") Green else Color(0xFFE5484D), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        Row(Modifier.padding(top = 10.dp)) {
            Box(Modifier.clickable { if (v.channelId.isNotEmpty() && v.source == "youtube") nav.channel(v.channelId) }) { Avatar(v.channelName, v.channelPicture, 34) }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(v.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Color.White)
                Text(listOfNotNull(v.channelName, compact(v.views)?.let { "$it views" }).joinToString(" · "), fontSize = 12.sp, color = Color.White.copy(alpha = 0.55f), maxLines = 1)
            }
        }
    }
}

@Composable
fun ShortCard(v: Video, nav: NavHostController) {
    Column(Modifier.width(130.dp).clickable { nav.watch(v) }) {
        AsyncImage(model = v.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(9f / 16f).clip(RoundedCornerShape(14.dp)).background(Panel))
        Text(v.title, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
fun ShortsRow(list: List<Video>, nav: NavHostController) {
    if (list.isEmpty()) return
    Text("Shorts", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 18.dp)) { items(list, key = { it.source + it.id }) { ShortCard(it, nav) } }
}

@Composable
fun PostCard(p: Post) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(16.dp)).background(Panel)
            .clickable { openWeb(context, if (p.network == "jace") "/post/${p.id}" else "/p/${p.network}/${Uri.encode(p.id)}") }.padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(p.author.name, p.author.picture, 36)
            Spacer(Modifier.width(10.dp))
            Column {
                Text(p.author.name, fontWeight = FontWeight.SemiBold)
                Text(if (p.network == "jace") "@${p.author.handle}" else p.author.handle, fontSize = 12.sp, color = Color.White.copy(alpha = 0.55f))
            }
        }
        p.title?.takeIf { it.isNotBlank() }?.let { Text(it, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
        if (p.text.isNotBlank()) Text(p.text, maxLines = 8, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        p.media.firstOrNull { it.kind == "image" }?.let { m ->
            AsyncImage(model = m.thumb ?: m.url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.padding(top = 10.dp).fillMaxWidth().heightIn(max = 320.dp).clip(RoundedCornerShape(12.dp)))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopBar(title: String, nav: NavHostController? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title, fontWeight = FontWeight.Bold) },
        navigationIcon = { if (nav != null) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Background),
    )
}

// ---------- Screens ----------

@Composable
fun HomeScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<Home>("/api/app/home")
    val context = LocalContext.current
    Column {
        TopBar("Jace Media") { IconButton(onClick = { openWeb(context, "/notifications") }) { Icon(Icons.Filled.Notifications, "Notifications") } }
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val h = s.value
                items(h.videos.take(4), key = { "a" + it.source + it.id }) { VideoCard(it, nav) }
                item { ShortsRow(h.shorts, nav) }
                items(h.videos.drop(4).take(8), key = { "b" + it.source + it.id }) { VideoCard(it, nav) }
                if (h.posts.isNotEmpty()) item { Text("From people", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)) }
                items(h.posts.take(10), key = { "p" + it.network + it.id }) { PostCard(it) }
                items(h.videos.drop(12), key = { "c" + it.source + it.id }) { VideoCard(it, nav) }
            }
        }
    }
}

@Composable
fun ShortsScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<VideoList>("/api/app/shorts")
    when (val s = state) {
        is Load.Loading -> Spinner()
        is Load.Failed -> Failed(s.message, reload)
        is Load.Ready -> {
            val list = s.value.videos
            val pager = rememberPagerState { list.size }
            VerticalPager(pager, modifier = Modifier.fillMaxSize().background(Color.Black), key = { list[it].source + list[it].id }) { page ->
                val v = list[page]
                Box(Modifier.fillMaxSize()) {
                    if (pager.currentPage == page) {
                        if (v.source == "jace" && v.src != null) FilePlayer(v.src, loop = true) else YouTubePlayer(v.id)
                    } else {
                        AsyncImage(model = v.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    }
                    Column(
                        Modifier.align(Alignment.BottomStart).fillMaxWidth()
                            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f))))
                            .padding(16.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { if (v.source == "youtube") nav.channel(v.channelId) }) {
                            Avatar(v.channelName, v.channelPicture, 30)
                            Spacer(Modifier.width(8.dp))
                            Text(v.channelName, fontWeight = FontWeight.SemiBold, color = Color.White)
                        }
                        Text(v.title, color = Color.White, maxLines = 2, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun SignInPrompt(text: String) {
    val context = LocalContext.current
    Column(Modifier.fillMaxWidth().padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Filled.AccountCircle, null, tint = Green, modifier = Modifier.size(52.dp))
        Text(text, color = Color.White.copy(alpha = 0.65f), modifier = Modifier.padding(vertical = 14.dp))
        Button(onClick = { openWeb(context, "/api/auth/signin?next=/api/app/done") }) { Text("Sign in with Jace") }
    }
}

@Composable
fun SubsScreen(nav: NavHostController, signedIn: Boolean) {
    val (state, reload) = rememberApi<Subscriptions>(if (signedIn) "/api/app/subscriptions" else null, signedIn)
    Column {
        TopBar("Subscriptions")
        if (!signedIn) return@Column SignInPrompt("Sign in to see videos from the channels and people you follow.")
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val sub = s.value
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(bottom = 18.dp)) {
                        items(sub.channels.filter { it.kind == "youtube" }, key = { it.ref }) { c ->
                            Column(Modifier.width(70.dp).clickable { nav.channel(c.ref) }, horizontalAlignment = Alignment.CenterHorizontally) {
                                Avatar(c.name, c.picture, 56)
                                Text(c.name, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                            }
                        }
                    }
                }
                item { ShortsRow(sub.videos.filter { it.short }, nav) }
                items(sub.videos.filter { !it.short }, key = { it.source + it.id }) { VideoCard(it, nav) }
                if (sub.videos.isEmpty()) item { Text("Nothing new from the channels you follow.", color = Color.White.copy(alpha = 0.6f)) }
            }
        }
    }
}

@Composable
fun SearchScreen(nav: NavHostController) {
    var text by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    val (state, _) = rememberApi<SearchResults>(if (query.isBlank()) null else "/api/app/search?q=${Api.q(query)}")
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
            is Load.Failed -> Failed(s.message) { query = query }
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp)) {
                val r = s.value
                items(r.channels.take(3), key = { "c" + it.id }) { c ->
                    Row(Modifier.fillMaxWidth().clickable { nav.channel(c.id) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(c.name, c.picture, 52)
                        Spacer(Modifier.width(12.dp))
                        Text(c.name, fontWeight = FontWeight.Bold)
                    }
                }
                item { ShortsRow(r.shorts, nav) }
                items(r.videos, key = { "v" + it.source + it.id }) { VideoCard(it, nav) }
                items(r.posts, key = { "p" + it.network + it.id }) { PostCard(it) }
            }
        }
    }
}

@Composable
fun WatchScreen(nav: NavHostController, source: String, id: String, signedIn: Boolean) {
    val (state, reload) = rememberApi<Watch>("/api/app/watch/$source/${Uri.encode(id)}")
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var vote by remember { mutableIntStateOf(0) }
    var subscribed by remember { mutableStateOf(false) }
    var more by remember { mutableStateOf(false) }

    LaunchedEffect(state) {
        val w = (state as? Load.Ready)?.value ?: return@LaunchedEffect
        vote = w.video.myVote
        subscribed = w.video.subscribed
        if (signedIn) Api.send("/api/history", mapOf("source" to source, "id" to id, "title" to w.video.title, "channelId" to w.video.channelId, "channelName" to w.video.channelName, "thumbnail" to w.video.thumbnail))
    }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)) {
            val v = (state as? Load.Ready)?.value?.video
            if (v != null) {
                if (v.stream.type == "file" && v.stream.url != null) FilePlayer(v.stream.url, loop = false) else YouTubePlayer(v.stream.id ?: v.id)
            }
            IconButton(onClick = { nav.popBackStack() }, modifier = Modifier.padding(4.dp)) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
        }
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val v = s.value.video
                item {
                    Text(v.title, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    Text(listOfNotNull(compact(v.views)?.let { "$it views" }, if (v.live) "🔴 Live" else null).joinToString(" · "), fontSize = 12.sp, color = Color.White.copy(alpha = 0.55f), modifier = Modifier.padding(top = 4.dp))
                    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Row(Modifier.weight(1f).clickable { v.channelId?.let { if (v.source == "youtube") nav.channel(it) } }, verticalAlignment = Alignment.CenterVertically) {
                            Avatar(v.channelName, v.channelPicture, 40)
                            Spacer(Modifier.width(10.dp))
                            Text(v.channelName, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (signedIn && v.channelId != null) {
                            Button(
                                onClick = {
                                    subscribed = !subscribed
                                    scope.launch {
                                        Api.send("/api/subscriptions", mapOf("kind" to v.source, "ref" to v.channelId, "name" to v.channelName, "picture" to v.channelPicture), if (subscribed) "POST" else "DELETE")
                                    }
                                },
                                colors = if (subscribed) ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.12f), contentColor = Color.White) else ButtonDefaults.buttonColors(),
                            ) { Text(if (subscribed) "Subscribed" else "Subscribe") }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        fun setVote(n: Int) {
                            vote = n
                            scope.launch { Api.send("/api/video-likes", mapOf("source" to source, "id" to id, "channelId" to v.channelId, "value" to n)) }
                        }
                        val likes = v.likes?.let { it + (if (vote == 1) 1 else 0) - (if (v.myVote == 1) 1 else 0) }
                        FilterChip(selected = vote == 1, enabled = signedIn, onClick = { setVote(if (vote == 1) 0 else 1) }, label = { Text("👍 ${compact(likes) ?: "Like"}") })
                        FilterChip(selected = vote == -1, enabled = signedIn, onClick = { setVote(if (vote == -1) 0 else -1) }, label = { Text("👎 ${compact(v.dislikes) ?: ""}".trim()) })
                        AssistChip(
                            enabled = signedIn,
                            onClick = {
                                scope.launch {
                                    Api.send("/api/playlists/watch-later/items", mapOf("video" to mapOf("source" to v.source, "id" to v.id, "title" to v.title, "thumbnail" to v.thumbnail, "channelId" to (v.channelId ?: ""), "channelName" to v.channelName)))
                                }
                            },
                            label = { Text("🕒 Save") },
                        )
                        AssistChip(
                            onClick = {
                                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "${Api.site}/watch/${v.source}/${v.id}"), "Share"))
                            },
                            label = { Text("Share") },
                        )
                    }
                    if (v.description.isNotBlank()) {
                        Text(
                            v.description,
                            maxLines = if (more) Int.MAX_VALUE else 3,
                            overflow = TextOverflow.Ellipsis,
                            fontSize = 14.sp,
                            modifier = Modifier.padding(top = 12.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Panel).clickable { more = !more }.padding(12.dp),
                        )
                    }
                    Text(
                        "💬 Comments",
                        modifier = Modifier.padding(vertical = 12.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Panel).clickable { openWeb(context, "/watch/${v.source}/${v.id}") }.padding(12.dp),
                    )
                    Text("Up next", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
                }
                items(s.value.upNext, key = { it.source + it.id }) { VideoCard(it, nav) }
            }
        }
    }
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
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 18.dp)) {
                        Avatar(p.channel.name, p.channel.picture, 64)
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(p.channel.name, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                            compact(p.channel.subscribers)?.let { Text("$it subscribers", fontSize = 12.sp, color = Color.White.copy(alpha = 0.55f)) }
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
fun YouScreen(nav: NavHostController, signedIn: Boolean) {
    val context = LocalContext.current
    val (me, _) = rememberApi<Me>("/api/app/me", signedIn)
    val (history, _) = rememberApi<HistoryList>(if (signedIn) "/api/app/history" else null, signedIn)
    val account = (me as? Load.Ready)?.value?.account
    LazyColumn(contentPadding = PaddingValues(16.dp)) {
        item {
            if (account != null) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 16.dp)) {
                    Avatar(account.name, account.picture, 60)
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(account.name, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("@${account.handle}", color = Color.White.copy(alpha = 0.55f))
                    }
                }
            } else if (!signedIn) {
                SignInPrompt("Sign in with Jace to subscribe, like, post, and keep your history.")
            }
        }
        val links = buildList {
            if (signedIn) {
                add("⬆️ Upload a video" to "/upload")
                add("🔴 Go live" to "/live/go")
                add("💬 Posts" to "/jace")
                add("🕒 Watch Later" to "/playlists/watch-later")
                add("📚 Playlists" to "/playlists")
                add("🎬 Your videos" to "/studio")
            }
            add("📡 Live" to "/live")
            add("🧩 Choose services" to "/services")
            add("⚙️ Extensions" to "/extensions")
            add("📰 Custom feeds" to "/feeds")
            add("📱 Get the app / updates" to "/apps")
        }
        items(links, key = { it.second }) { (label, path) ->
            Text(label, fontSize = 16.sp, modifier = Modifier.fillMaxWidth().clickable { openWeb(context, path) }.padding(vertical = 13.dp))
        }
        val items = (history as? Load.Ready)?.value?.items.orEmpty()
        if (items.isNotEmpty()) {
            item { Text("History", fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp)) }
            items(items.take(15), key = { "h" + it.source + it.id }) { h ->
                Column(Modifier.fillMaxWidth().clickable { nav.navigate("watch/${h.source}/${Uri.encode(h.id)}") }.padding(vertical = 8.dp)) {
                    Text(h.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    h.channelName?.let { Text(it, fontSize = 12.sp, color = Color.White.copy(alpha = 0.55f)) }
                }
            }
        }
        if (signedIn) {
            item {
                TextButton(onClick = { openWeb(context, "/api/auth/signin?mode=add&next=/api/app/done") }, modifier = Modifier.padding(top = 18.dp)) { Text("Add another account") }
                TextButton(onClick = {
                    CookieManager.getInstance().removeAllCookies(null)
                    CookieManager.getInstance().flush()
                    (context as? AppActivity)?.recreate()
                }) { Text("Sign out", color = Color(0xFFFF7B7B)) }
            }
        }
    }
}

// ---------- Players ----------

/** Jace videos: Media3 (ExoPlayer), with Android's own controls. */
@Composable
fun FilePlayer(url: String, loop: Boolean) {
    val context = LocalContext.current
    val exo = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            playWhenReady = true
            prepare()
        }
    }
    DisposableEffect(exo) { onDispose { exo.release() } }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { exo.pause() }
    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                player = exo
                useController = !loop
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            }
        },
        modifier = Modifier.fillMaxSize().clickable(enabled = loop) { exo.playWhenReady = !exo.playWhenReady },
    )
}

/** YouTube videos: YouTube's privacy-enhanced player, with no ads added by Jace Media. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun YouTubePlayer(id: String) {
    val html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
        <body><iframe src="https://www.youtube-nocookie.com/embed/$id?playsinline=1&autoplay=1&rel=0&modestbranding=1&iv_load_policy=3"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>
    """.trimIndent()
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.domStorageEnabled = true
                webChromeClient = WebChromeClient()
                setBackgroundColor(android.graphics.Color.BLACK)
                loadDataWithBaseURL(Api.site, html, "text/html", "utf-8", null)
            }
        },
        onRelease = { it.destroy() },
        modifier = Modifier.fillMaxSize(),
    )
}
