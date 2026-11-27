package com.okjace.jacemedia

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import kotlinx.coroutines.launch

// ---------- Comments: like any comment, reply to any comment, open replies ----------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CommentsSheet(source: String, id: String, title: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var reload by remember { mutableIntStateOf(0) }
    val (state, retry) = rememberApi<CommentsResponse>("/api/comments?source=$source&id=${Api.q(id)}", reload)
    var text by remember { mutableStateOf("") }
    var replyTo by remember { mutableStateOf<Pair<String, String>?>(null) }
    var sending by remember { mutableStateOf(false) }

    fun startReply(key: String, name: String) {
        if (!Session.signedIn) return signIn(context)
        replyTo = key to name
    }

    ModalBottomSheet(onDismissRequest = onClose, containerColor = Background) {
        Column(Modifier.fillMaxHeight(0.85f)) {
            Text("Comments", fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.padding(horizontal = 16.dp))
            Text(title, color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp))
            Box(Modifier.weight(1f)) {
                when (val s = state) {
                    is Load.Loading -> Spinner()
                    is Load.Failed -> Failed(s.message, retry)
                    is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        val d = s.value
                        items(d.mine, key = { it.key }) { c ->
                            CommentItem(c.key, null, c.author.name, c.author.picture, c.text, c.createdAt, c.likes, c.liked, c.replies, false, reload = reload) { startReply(c.key, c.author.name) }
                        }
                        if (d.others.isNotEmpty() && source == "youtube") item { Text("ON YOUTUBE", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Muted) }
                        items(d.others, key = { it.key }) { c ->
                            CommentItem(c.key, if (c.key.startsWith("yt:")) c.id else null, c.name, c.picture, c.text, c.`when`, c.likes, c.liked, c.replies, c.pinned, reload = reload) { startReply(c.key, c.name) }
                        }
                        if (d.mine.isEmpty() && d.others.isEmpty()) item { Text("No comments yet. Be the first!", color = Muted) }
                    }
                }
            }
            Column(Modifier.fillMaxWidth().background(Panel).padding(12.dp).navigationBarsPadding().imePadding()) {
                replyTo?.let { (_, name) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Replying to $name", fontSize = 12.sp, color = Muted, modifier = Modifier.weight(1f))
                        TextButton(onClick = { replyTo = null; text = "" }) { Text("Cancel") }
                    }
                }
                if (Session.signedIn) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = text,
                            onValueChange = { text = it },
                            placeholder = { Text(if (replyTo == null) "Add a comment" else "Add a reply") },
                            maxLines = 5,
                            shape = RoundedCornerShape(22.dp),
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        FilledIconButton(
                            enabled = text.isNotBlank() && !sending,
                            onClick = {
                                val body = text.trim()
                                sending = true
                                scope.launch {
                                    val r = replyTo
                                    val ok = when {
                                        r != null -> Api.send("/api/ext-comments", mapOf("network" to "comment", "postId" to r.first, "body" to body))
                                        source == "jace" -> Api.send("/api/jace-comments", mapOf("postId" to id, "body" to body))
                                        else -> Api.send("/api/ext-comments", mapOf("network" to "youtube", "postId" to id, "body" to body))
                                    }
                                    sending = false
                                    if (ok) { text = ""; replyTo = null; reload++ }
                                }
                            },
                        ) { Icon(Icons.AutoMirrored.Filled.Send, "Send") }
                    }
                } else {
                    Button(onClick = { signIn(context) }, modifier = Modifier.fillMaxWidth()) { Text("Sign in to comment") }
                }
            }
        }
    }
}

@Composable
fun CommentItem(
    key: String,
    ytId: String?,
    name: String,
    picture: String?,
    text: String,
    whenIso: String?,
    likes: Double,
    liked: Boolean,
    replies: Int,
    pinned: Boolean,
    small: Boolean = false,
    reload: Int = 0,
    onReply: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var on by remember(key) { mutableStateOf(liked) }
    var count by remember(key) { mutableDoubleStateOf(likes) }
    var open by remember(key) { mutableStateOf(false) }
    var thread by remember(key) { mutableStateOf<RepliesResponse?>(null) }

    suspend fun loadThread() {
        val q = "/api/comments?key=${Api.q(key)}" + (ytId?.let { "&replies=$it" } ?: "")
        thread = runCatching { Api.get<RepliesResponse>(q) }.getOrDefault(RepliesResponse())
    }
    LaunchedEffect(reload) { if (reload > 0 && (open || replies > 0)) loadThread() }

    Row {
        Avatar(name, picture, if (small) 28 else 36)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                ago(whenIso)?.let { Text(" · $it", color = Muted, fontSize = 12.sp) }
                if (pinned) Text("  📌 Pinned", color = Green, fontSize = 11.sp)
            }
            Text(text, fontSize = if (small) 14.sp else 15.sp, modifier = Modifier.padding(top = 2.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                Row(
                    Modifier.clip(RoundedCornerShape(50)).clickable {
                        if (!Session.signedIn) return@clickable signIn(context)
                        val next = !on
                        on = next
                        count += if (next) 1 else -1
                        scope.launch {
                            val r = runCatching { Api.post<LikeResult>("/api/comment-likes", mapOf("key" to key, "like" to next)) }.getOrNull()
                            if (r == null) { on = !next; count += if (next) -1 else 1 }
                        }
                    }.padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(if (on) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, "Like", tint = if (on) Color(0xFFFF5A5F) else Muted, modifier = Modifier.size(16.dp))
                    if (count > 0) Text(" ${compact(count)}", fontSize = 12.sp, color = Muted)
                }
                Text("Reply", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Muted, modifier = Modifier.clip(RoundedCornerShape(50)).clickable(onClick = onReply).padding(6.dp))
                val n = maxOf(replies, (thread?.replies?.size ?: 0) + (thread?.mine?.size ?: 0))
                if (n > 0) {
                    Text(
                        if (open) "Hide replies" else "$n repl${if (n == 1) "y" else "ies"}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Green,
                        modifier = Modifier.clip(RoundedCornerShape(50)).clickable {
                            open = !open
                            if (open && thread == null) scope.launch { loadThread() }
                        }.padding(6.dp),
                    )
                }
            }
            if (open) {
                Column(Modifier.padding(start = 6.dp, top = 6.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    val t = thread
                    if (t == null) CircularProgressIndicator(color = Green, modifier = Modifier.size(22.dp))
                    t?.mine?.forEach { c -> CommentItem(c.key, null, c.author.name, c.author.picture, c.text, c.createdAt, c.likes, c.liked, 0, false, small = true, onReply = onReply) }
                    t?.replies?.forEach { c -> CommentItem(c.key, null, c.name, c.picture, c.text, c.`when`, c.likes, c.liked, 0, false, small = true, onReply = onReply) }
                }
            }
        }
    }
}

// ---------- Posts ----------

@Composable
fun PostsScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<PostsResponse>("/api/app/posts", Session.version)
    Column {
        TopBar("Posts", nav) { if (Session.signedIn) IconButton(onClick = { nav.navigate("compose") }) { Icon(Icons.Filled.Edit, "Write a post") } }
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) { items(s.value.posts, key = { it.network + it.id }) { PostCard(it, nav) } }
        }
    }
}

@Composable
fun PostScreen(nav: NavHostController, network: String, id: String) {
    var reload by remember { mutableIntStateOf(0) }
    val (state, retry) = rememberApi<PostThread>("/api/app/post/$network/${Uri.encode(id)}", reload)
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        TopBar("Post", nav)
        Box(Modifier.weight(1f)) {
            when (val s = state) {
                is Load.Loading -> Spinner()
                is Load.Failed -> Failed(s.message, retry)
                is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                    val t = s.value
                    item { PostCard(t.post, nav, linked = false) }
                    if (t.comments.isNotEmpty()) item { Text("On Jace Media", fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 8.dp)) }
                    items(t.comments, key = { "c" + it.id }) { PostCard(it, nav, linked = false) }
                    if (t.replies.isNotEmpty()) item {
                        Text(if (network == "jace") "Replies" else "Replies on ${networkName(network) ?: network}", fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 8.dp))
                    }
                    items(t.replies, key = { "r" + it.id }) { PostCard(it, nav, linked = network == "jace") }
                }
            }
        }
        if (Session.signedIn) {
            Row(Modifier.fillMaxWidth().background(Panel).padding(12.dp).imePadding(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = text, onValueChange = { text = it }, placeholder = { Text("Write a reply") }, maxLines = 5, shape = RoundedCornerShape(22.dp), modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                FilledIconButton(
                    enabled = text.isNotBlank() && !sending,
                    onClick = {
                        sending = true
                        scope.launch {
                            val body = text.trim()
                            val ok = if (network == "jace") Api.send("/api/posts", mapOf("body" to body, "parentId" to id))
                            else Api.send("/api/ext-comments", mapOf("network" to network, "postId" to id, "body" to body))
                            sending = false
                            if (ok) { text = ""; reload++ }
                        }
                    },
                ) { Icon(Icons.AutoMirrored.Filled.Send, "Send") }
            }
        }
    }
}

/** Write a post: text and a picture. */
@Composable
fun ComposeScreen(nav: NavHostController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var picture by remember { mutableStateOf<Uri?>(null) }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { picture = it }
    Column {
        TopBar("New post", nav) {
            TextButton(
                enabled = !sending && (text.isNotBlank() || picture != null) && text.length <= 1000,
                onClick = {
                    sending = true
                    error = null
                    scope.launch {
                        try {
                            val url = picture?.let { Api.upload(context, it, "thumbnail").public_url }
                            Api.postText("/api/posts", mapOf("body" to text, "imageUrl" to url))
                            nav.popBackStack()
                        } catch (e: Exception) {
                            error = e.message
                        }
                        sending = false
                    }
                },
            ) { Text(if (sending) "Posting…" else "Post", fontWeight = FontWeight.Bold) }
        }
        Column(Modifier.padding(16.dp)) {
            Session.me?.account?.let { a ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 12.dp)) {
                    Avatar(a.name, a.picture, 40)
                    Text(a.name, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 10.dp))
                }
            }
            OutlinedTextField(value = text, onValueChange = { text = it }, placeholder = { Text("What's happening?") }, minLines = 4, maxLines = 14, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth())
            picture?.let {
                Box(Modifier.padding(top = 12.dp)) {
                    AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().heightIn(max = 240.dp).clip(RoundedCornerShape(14.dp)))
                    Box(Modifier.padding(6.dp).align(Alignment.TopEnd)) { RoundIcon(Icons.Filled.Close, "Remove picture") { picture = null } }
                }
            }
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Pill("Picture", Icons.Filled.Image) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
                Spacer(Modifier.weight(1f))
                Text("${1000 - text.length}", color = if (text.length > 1000) Color.Red else Muted, fontSize = 12.sp)
            }
            error?.let { Text(it, color = Color(0xFFFF7B7B), modifier = Modifier.padding(top = 10.dp)) }
        }
    }
}

// ---------- Notifications ----------

@Composable
fun NotificationsScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<NotificationsResponse>("/api/app/notifications")
    Column {
        TopBar("Notifications", nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                if (s.value.items.isEmpty()) item { Text("No notifications yet.", color = Muted) }
                items(s.value.items, key = { it.id }) { n ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (!n.read) Green.copy(alpha = 0.08f) else Color.Transparent)
                            .clickable(enabled = n.postId != null) { nav.navigate("post/jace/${Uri.encode(n.postId ?: "")}") }.padding(10.dp),
                    ) {
                        Avatar(n.actor.name, n.actor.picture, 40)
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(buildAnnotatedString {
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(n.actor.name) }
                                append(" ${n.text}")
                            }, fontSize = 14.sp)
                            n.postText?.takeIf { it.isNotBlank() }?.let { Text(it, color = Muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                            ago(n.createdAt)?.let { Text(it, color = Muted, fontSize = 11.sp) }
                        }
                    }
                }
            }
        }
    }
}

// ---------- Library ----------

@Composable
fun LibraryScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<LibraryResponse>("/api/app/library")
    Column {
        TopBar("Library", nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val l = s.value
                if (l.continueWatching.isNotEmpty()) {
                    item { Text("Continue watching", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)) }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                            items(l.continueWatching, key = { it.source + it.id }) { VideoCard(it, nav, Modifier.width(260.dp)) }
                        }
                    }
                }
                item { Text("Watch Later", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)) }
                if (l.watchLater.isEmpty()) item { Text("Hold a video and choose Save to Watch Later.", color = Muted, modifier = Modifier.padding(bottom = 16.dp)) }
                items(l.watchLater, key = { "w" + it.source + it.id }) { VideoCard(it, nav) }
                if (l.playlists.isNotEmpty()) item { Text("Playlists", fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 10.dp)) }
                items(l.playlists, key = { it.id }) { p ->
                    Row(Modifier.fillMaxWidth().clickable { nav.navigate("playlist/${Uri.encode(p.id)}") }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        AsyncImage(model = p.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.width(120.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp)).background(Panel))
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(p.name, fontWeight = FontWeight.Bold)
                            Text("${p.count} videos", color = Muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PlaylistScreen(nav: NavHostController, id: String) {
    val (state, reload) = rememberApi<PlaylistResponse>("/api/app/playlist/${Uri.encode(id)}")
    Column {
        TopBar((state as? Load.Ready)?.value?.name ?: "Playlist", nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                if (s.value.videos.isEmpty()) item { Text("This playlist is empty.", color = Muted) }
                items(s.value.videos, key = { it.source + it.id }) { VideoCard(it, nav) }
            }
        }
    }
}

@Composable
fun HistoryScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<HistoryList>("/api/app/history")
    Column {
        TopBar("History", nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                items(s.value.items, key = { it.source + it.id }) { h ->
                    Column(Modifier.fillMaxWidth().clickable { nav.navigate("watch/${h.source}/${Uri.encode(h.id)}") }.padding(vertical = 10.dp)) {
                        Text(h.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        h.channelName?.let { Text(it, fontSize = 12.sp, color = Muted) }
                    }
                }
            }
        }
    }
}

// ---------- Live ----------

@Composable
fun LiveScreen(nav: NavHostController) {
    val context = LocalContext.current
    val (state, reload) = rememberApi<LiveResponse>("/api/app/live")
    Column {
        TopBar("Live", nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                val l = s.value
                if (l.jace.isNotEmpty()) item { Text("Live on Jace Media", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)) }
                items(l.jace, key = { it.id }) { st ->
                    Column(Modifier.fillMaxWidth().clickable { openWeb(context, "/live/watch/${st.id}") }.padding(bottom = 18.dp)) {
                        Box {
                            AsyncImage(model = st.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(16.dp)).background(Panel))
                            Text("LIVE · ${st.viewers}", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(8.dp).background(Color(0xFFE5484D), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 3.dp))
                        }
                        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.clip(CircleShape).background(Color(0xFFE5484D)).padding(2.dp)) { Avatar(st.host.name, st.host.picture, 32) }
                            Text(st.title, fontWeight = FontWeight.SemiBold, maxLines = 2, modifier = Modifier.padding(start = 10.dp))
                        }
                    }
                }
                if (l.youtube.isNotEmpty()) item { Text("Live on YouTube", fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp)) }
                items(l.youtube, key = { it.source + it.id }) { VideoCard(it, nav) }
                if (l.jace.isEmpty() && l.youtube.isEmpty()) item { Text("Nobody's live right now.", color = Muted) }
            }
        }
    }
}

// ---------- Feeds ----------

@Composable
fun FeedsScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<FeedsResponse>("/api/app/feeds")
    Column {
        TopBar("Your feeds", nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                if (s.value.feeds.isEmpty()) item { Text("You haven't made any feeds yet.", color = Muted) }
                items(s.value.feeds, key = { it.id }) { f ->
                    Row(Modifier.fillMaxWidth().clickable { nav.navigate("feed/${Uri.encode(f.id)}/${Uri.encode(f.name)}") }.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.FilterList, null, tint = Green)
                        Text(f.name, fontSize = 16.sp, modifier = Modifier.padding(start = 14.dp).weight(1f))
                        if (f.home) Text("Home", color = Green, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun FeedScreen(nav: NavHostController, id: String, name: String) {
    val (state, reload) = rememberApi<FeedResponse>("/api/app/feed/${Uri.encode(id)}")
    Column {
        TopBar(name, nav)
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                item { ShortsRow(s.value.shorts, nav) }
                items(s.value.videos, key = { it.source + it.id }) { VideoCard(it, nav) }
                items(s.value.posts, key = { "p" + it.network + it.id }) { PostCard(it, nav) }
            }
        }
    }
}

// ---------- Your videos and uploading ----------

@Composable
fun MyVideosScreen(nav: NavHostController) {
    val (state, reload) = rememberApi<MyVideosResponse>("/api/app/myvideos")
    Column {
        TopBar("Your videos", nav) { IconButton(onClick = { nav.navigate("upload") }) { Icon(Icons.Filled.Add, "Upload") } }
        when (val s = state) {
            is Load.Loading -> Spinner()
            is Load.Failed -> Failed(s.message, reload)
            is Load.Ready -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                if (s.value.videos.isEmpty()) item { Text("You haven't uploaded any videos yet.", color = Muted) }
                items(s.value.videos, key = { it.id }) { v ->
                    Row(Modifier.fillMaxWidth().clickable { nav.navigate("watch/jace/${Uri.encode(v.id)}") }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        AsyncImage(model = v.thumbnail, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.width(130.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp)).background(Panel))
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(v.title, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(listOfNotNull(v.visibility?.replaceFirstChar { it.uppercase() }, ago(v.publishedAt)).joinToString(" · "), color = Muted, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

/** Upload natively: pick a video, watch it first, add details, send it to Jace. */
@Composable
fun UploadScreen(nav: NavHostController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var file by remember { mutableStateOf<Uri?>(null) }
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var visibility by remember { mutableStateOf("public") }
    var progress by remember { mutableStateOf<Float?>(null) }
    var done by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var fullscreen by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { if (it != null) { file = it; error = null } }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { if (it != null) { file = it; error = null } }

    Column {
        TopBar("Upload", nav) {
            TextButton(
                enabled = file != null && title.isNotBlank() && progress == null && !done,
                onClick = {
                    val f = file ?: return@TextButton
                    progress = 0f
                    error = null
                    scope.launch {
                        try {
                            val ticket = Api.upload(context, f, "video") { p -> scope.launch { progress = p * 0.97f } }
                            Api.postText("/api/videos", mapOf("path" to ticket.path, "title" to title, "description" to description, "visibility" to visibility))
                            progress = 1f
                            done = true
                        } catch (e: Exception) {
                            error = e.message
                            progress = null
                        }
                    }
                },
            ) { Text("Upload", fontWeight = FontWeight.Bold) }
        }
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                val f = file
                if (f != null) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(14.dp))) {
                        val player = rememberJacePlayer(null, f.toString(), autoplay = false)
                        JacePlayerView(player, fullscreen, { fullscreen = it }, Modifier.fillMaxSize())
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill(if (file == null) "Choose a video" else "Choose another", Icons.Filled.VideoLibrary) { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) }
                    Pill("Files", Icons.Filled.Folder) { pickFile.launch("video/*") }
                }
            }
            item { OutlinedTextField(value = title, onValueChange = { title = it.take(140) }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
            item { OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") }, minLines = 3, modifier = Modifier.fillMaxWidth()) }
            item {
                Text("Who can watch", fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                    listOf("public" to "Everyone", "unlisted" to "Link only", "private" to "Only you").forEach { (v, label) ->
                        FilterChip(selected = visibility == v, onClick = { visibility = v }, label = { Text(label) })
                    }
                }
            }
            progress?.let { p ->
                item {
                    Text(if (done) "Uploaded!" else "Uploading… ${(p * 100).toInt()}%", color = if (done) Green else Color.White)
                    LinearProgressIndicator(progress = { p }, color = Green, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                }
            }
            error?.let { item { Text(it, color = Color(0xFFFF7B7B)) } }
        }
    }
}

// ---------- Accounts ----------

@Composable
fun AccountsScreen(nav: NavHostController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    val me = Session.me
    Column {
        TopBar("Accounts", nav)
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            me?.account?.let { a ->
                item { Text("Using", color = Muted, fontWeight = FontWeight.Bold) }
                item {
                    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(a.name, a.picture, 46)
                        Column(Modifier.padding(start = 12.dp).weight(1f)) {
                            Text(a.name, fontWeight = FontWeight.Bold)
                            Text("@${a.handle}", color = Muted, fontSize = 12.sp)
                        }
                        Icon(Icons.Filled.CheckCircle, null, tint = Green)
                        IconButton(onClick = { scope.launch { Session.remove(a.sub) } }) { Icon(Icons.Filled.Logout, "Sign out of this account", tint = Muted) }
                    }
                }
            }
            if (!me?.others.isNullOrEmpty()) item { Text("On this phone", color = Muted, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp)) }
            items(me?.others.orEmpty(), key = { it.sub }) { o ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable {
                        busy = o.sub
                        scope.launch { Session.switchTo(o.sub); busy = null; nav.popBackStack() }
                    }.padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(o.name, o.picture, 46)
                    Column(Modifier.padding(start = 12.dp).weight(1f)) {
                        Text(o.name, fontWeight = FontWeight.Bold)
                        Text("@${o.handle}", color = Muted, fontSize = 12.sp)
                    }
                    if (busy == o.sub) CircularProgressIndicator(color = Green, modifier = Modifier.size(22.dp))
                    IconButton(onClick = { scope.launch { Session.remove(o.sub) } }) { Icon(Icons.Filled.Close, "Remove", tint = Muted) }
                }
            }
            item {
                Column(Modifier.padding(top = 16.dp)) {
                    Pill("Add another account", Icons.Filled.PersonAdd) { signIn(context, add = true) }
                    if (Session.signedIn) {
                        TextButton(onClick = {
                            Api.keepSession(null)
                            Session.refresh()
                            nav.popBackStack()
                        }, modifier = Modifier.padding(top = 8.dp)) { Text("Sign out of all accounts", color = Color(0xFFFF7B7B)) }
                    }
                }
            }
        }
    }
}

// ---------- Settings ----------

private val ServiceList = listOf(
    "youtube" to "YouTube", "jacevideos" to "Jace videos", "jace" to "Jace posts", "bluesky" to "Bluesky", "mastodon" to "Mastodon",
    "lemmy" to "Lemmy", "hackernews" to "Hacker News", "rss" to "News & blogs", "jacelive" to "Jace Live", "twitch" to "Twitch",
)

private val ExtensionList = listOf(
    Triple("sponsorblock", "SponsorBlock", "Skips sponsor segments"),
    Triple("dislikes", "Return YouTube Dislike", "Shows dislike counts"),
    Triple("dearrow", "DeArrow", "Better titles and thumbnails"),
    Triple("hideShorts", "Hide Shorts", "Removes Shorts from every feed"),
    Triple("hideWatched", "Hide watched videos", "Watched videos leave your feeds"),
    Triple("autoplayNext", "Autoplay next", "Plays the next video when one ends"),
    Triple("resume", "Resume where you left off", "Long videos pick up where you stopped"),
    Triple("hideCounts", "Hide counts", "Hides views, likes, and followers"),
)

@kotlinx.serialization.Serializable
data class AppSettings(val services: List<String> = emptyList(), val extensions: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap())

@Composable
fun SettingsScreen(nav: NavHostController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val (state, _) = rememberApi<AppSettings>("/api/app/me")
    var services by remember { mutableStateOf<Set<String>?>(null) }
    var ext by remember { mutableStateOf(mapOf<String, Boolean>()) }
    var rating by remember { mutableStateOf("teen") }
    var quality by remember { mutableStateOf(JacePlayer.prefs(context).getString("quality", "default") ?: "default") }
    LaunchedEffect(state) {
        val s = (state as? Load.Ready)?.value ?: return@LaunchedEffect
        services = s.services.toSet()
        ext = s.extensions.mapNotNull { (k, v) -> (v as? kotlinx.serialization.json.JsonPrimitive)?.let { p -> p.content.toBooleanStrictOrNull()?.let { k to it } } }.toMap()
        (s.extensions["rating"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { rating = it }
    }
    Column {
        TopBar("Settings", nav)
        LazyColumn(contentPadding = PaddingValues(16.dp)) {
            item { Text("Services", fontWeight = FontWeight.Bold, color = Muted) }
            items(ServiceList, key = { it.first }) { (id, label) ->
                val on = services?.contains(id) == true
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(label, modifier = Modifier.weight(1f))
                    Switch(checked = on, enabled = services != null, onCheckedChange = { v ->
                        val next = (services ?: emptySet()).let { if (v) it + id else it - id }
                        if (next.isNotEmpty()) {
                            services = next
                            scope.launch { Api.send("/api/preferences", mapOf("services" to next.toList()), "PUT") }
                        }
                    })
                }
            }
            item { Text("Content filter", fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 16.dp)) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                    listOf("kids" to "Kids", "teen" to "Teen", "all" to "Everything").forEach { (v, label) ->
                        FilterChip(selected = rating == v, onClick = {
                            rating = v
                            scope.launch { Api.send("/api/extensions", mapOf("merge" to true, "rating" to v), "PUT") }
                        }, label = { Text(label) })
                    }
                }
            }
            item { Text("Video quality", fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 16.dp)) }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                    items(Qualities, key = { it.first }) { (q, label) ->
                        FilterChip(selected = quality == q, onClick = {
                            quality = q
                            JacePlayer.prefs(context).edit().putString("quality", q).apply()
                        }, label = { Text(label) })
                    }
                }
            }
            item { Text("Extensions", fontWeight = FontWeight.Bold, color = Muted, modifier = Modifier.padding(top = 16.dp)) }
            items(ExtensionList, key = { it.first }) { (id, label, blurb) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(label)
                        Text(blurb, color = Muted, fontSize = 12.sp)
                    }
                    Switch(checked = ext[id] == true, onCheckedChange = { v ->
                        ext = ext + (id to v)
                        scope.launch { Api.send("/api/extensions", mapOf("merge" to true, id to v), "PUT") }
                    })
                }
            }
            item {
                Text("App ${BuildConfig.VERSION_NAME}", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 20.dp))
                Pill("Get updates", Icons.Filled.SystemUpdate) { openWeb(context, "/apps") }
            }
        }
    }
}
