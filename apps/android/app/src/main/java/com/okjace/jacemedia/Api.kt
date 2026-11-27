package com.okjace.jacemedia

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Jace Media's app API (/api/app/…). The phone app shares its sign-in with
 * the web screens: requests carry the same cookies Android's WebView keeps.
 */

@Serializable
data class Video(
    val source: String,
    val id: String,
    val title: String,
    val thumbnail: String? = null,
    val channelId: String = "",
    val channelName: String = "",
    val channelPicture: String? = null,
    val publishedAt: String? = null,
    val views: Double? = null,
    val short: Boolean = false,
    val src: String? = null,
)

@Serializable data class Author(val name: String, val handle: String = "", val picture: String? = null)
@Serializable data class Media(val kind: String = "image", val url: String? = null, val thumb: String? = null, val src: String? = null)
@Serializable data class PostStats(val likes: Double? = null, val replies: Double? = null, val reposts: Double? = null)
@Serializable data class PostVideo(val source: String, val id: String, val title: String? = null, val thumbnail: String? = null, val src: String? = null)

@Serializable
data class Post(
    val network: String,
    val id: String,
    val text: String = "",
    val title: String? = null,
    val createdAt: String? = null,
    val author: Author,
    val media: List<Media> = emptyList(),
    val url: String? = null,
    val stats: PostStats? = null,
    val likedByMe: Boolean = false,
    val video: PostVideo? = null,
    val authorSub: String? = null,
) {
    /** Who to follow from this post (like the website's followTarget). */
    val followRef: String
        get() = when (network) {
            "jace" -> authorSub.orEmpty()
            "bluesky", "mastodon" -> author.handle.removePrefix("@")
            else -> ""
        }
}

@Serializable data class Account(val sub: String, val handle: String, val name: String, val picture: String? = null)
@Serializable data class Me(val account: Account? = null, val others: List<Account> = emptyList())

// Comments: every one has a key to like it and reply to it.
@Serializable
data class OtherComment(
    val id: String,
    val key: String,
    val name: String,
    val picture: String? = null,
    val text: String = "",
    val `when`: String? = null,
    val likes: Double = 0.0,
    val liked: Boolean = false,
    val pinned: Boolean = false,
    val replies: Int = 0,
)

@Serializable
data class MineComment(
    val id: String,
    val key: String,
    val text: String = "",
    val createdAt: String? = null,
    val author: Author,
    val likes: Double = 0.0,
    val liked: Boolean = false,
    val replies: Int = 0,
)

@Serializable data class CommentsResponse(val mine: List<MineComment> = emptyList(), val others: List<OtherComment> = emptyList())
@Serializable data class RepliesResponse(val replies: List<OtherComment> = emptyList(), val mine: List<MineComment> = emptyList())
@Serializable data class LikeResult(val count: Int = 0, val mine: Boolean = false)

@Serializable
data class NotificationItem(
    val id: String,
    val kind: String,
    val actor: Author,
    val postId: String? = null,
    val postText: String? = null,
    val read: Boolean = true,
    val createdAt: String? = null,
) {
    val text: String
        get() = when (kind) {
            "reply" -> "replied to your post"
            "like" -> "liked your post"
            "repost" -> "reposted your post"
            "quote" -> "quoted your post"
            "follow" -> "followed you"
            "mention" -> "mentioned you"
            "live" -> "is live now"
            else -> kind
        }
}

@Serializable data class NotificationsResponse(val items: List<NotificationItem> = emptyList())
@Serializable data class PlaylistInfo(val id: String, val name: String, val count: Int = 0, val thumbnail: String? = null)
@Serializable data class LibraryResponse(val continueWatching: List<Video> = emptyList(), val watchLater: List<Video> = emptyList(), val playlists: List<PlaylistInfo> = emptyList())
@Serializable data class PlaylistResponse(val name: String = "", val videos: List<Video> = emptyList())
@Serializable data class LiveHost(val name: String, val picture: String? = null)
@Serializable data class LiveStream(val id: String, val title: String, val thumbnail: String? = null, val viewers: Int = 0, val host: LiveHost)
@Serializable data class LiveResponse(val jace: List<LiveStream> = emptyList(), val youtube: List<Video> = emptyList())
@Serializable data class PostsResponse(val posts: List<Post> = emptyList())
@Serializable data class PostThread(val post: Post, val replies: List<Post> = emptyList(), val comments: List<Post> = emptyList())
@Serializable data class FeedInfo(val id: String, val name: String, val home: Boolean = false)
@Serializable data class FeedsResponse(val feeds: List<FeedInfo> = emptyList())
@Serializable data class FeedResponse(val videos: List<Video> = emptyList(), val shorts: List<Video> = emptyList(), val posts: List<Post> = emptyList())
@Serializable data class FollowingResponse(val following: List<String> = emptyList())
@Serializable data class MyVideo(val id: String, val title: String, val thumbnail: String? = null, val publishedAt: String? = null, val visibility: String? = null)
@Serializable data class MyVideosResponse(val videos: List<MyVideo> = emptyList())
@Serializable data class UploadTicket(val path: String, val upload_url: String, val method: String = "PUT", val headers: Map<String, String> = emptyMap(), val public_url: String? = null)
@Serializable data class SessionAnswer(val session: String? = null, val reauth: Boolean = false, val banned: Boolean = false)
@Serializable data class Home(val videos: List<Video> = emptyList(), val shorts: List<Video> = emptyList(), val posts: List<Post> = emptyList())
@Serializable data class VideoList(val videos: List<Video> = emptyList())
@Serializable data class Channel(val kind: String, val ref: String, val name: String, val picture: String? = null)
@Serializable data class Subscriptions(val channels: List<Channel> = emptyList(), val videos: List<Video> = emptyList(), val posts: List<Post> = emptyList())
@Serializable data class FoundChannel(val id: String, val name: String, val picture: String? = null)

@Serializable
data class SearchResults(
    val videos: List<Video> = emptyList(),
    val shorts: List<Video> = emptyList(),
    val channels: List<FoundChannel> = emptyList(),
    val posts: List<Post> = emptyList(),
)

@Serializable data class VideoStream(val type: String, val url: String? = null, val id: String? = null)

@Serializable
data class WatchVideo(
    val source: String,
    val id: String,
    val title: String,
    val description: String = "",
    val channelId: String? = null,
    val channelName: String = "",
    val channelPicture: String? = null,
    val views: Double? = null,
    val likes: Double? = null,
    val dislikes: Double? = null,
    val myVote: Int = 0,
    val live: Boolean = false,
    val thumbnail: String? = null,
    val stream: VideoStream,
    val subscribed: Boolean = false,
)

@Serializable data class Watch(val video: WatchVideo, val upNext: List<Video> = emptyList())

@Serializable
data class ChannelPage(val channel: Info, val videos: List<Video> = emptyList(), val shorts: List<Video> = emptyList()) {
    @Serializable data class Info(val name: String, val picture: String? = null, val subscribers: Double? = null)
}

@Serializable data class HistoryItem(val source: String, val id: String, val title: String, val channelName: String? = null)
@Serializable data class HistoryList(val items: List<HistoryItem> = emptyList())

class ApiException(message: String) : Exception(message)

object Api {
    val site: String = BuildConfig.SITE
    val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    private fun open(path: String, method: String): HttpURLConnection {
        val conn = URL(site + path).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        conn.setRequestProperty("User-Agent", "JaceMediaApp/${BuildConfig.VERSION_NAME} (Android)")
        CookieManager.getInstance().getCookie(site)?.let { conn.setRequestProperty("Cookie", it) }
        return conn
    }

    suspend inline fun <reified T> get(path: String): T = json.decodeFromString(getText(path))

    suspend fun getText(path: String): String = withContext(Dispatchers.IO) {
        val conn = open(path, "GET")
        try {
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.readText().orEmpty()
            if (code !in 200..299) {
                val message = runCatching { (json.parseToJsonElement(body) as JsonObject)["error"]?.let { (it as JsonPrimitive).content } }.getOrNull()
                throw ApiException(message ?: "Something went wrong ($code).")
            }
            body
        } finally {
            conn.disconnect()
        }
    }

    /** POST / DELETE with a JSON body. True when it worked. */
    suspend fun send(path: String, body: Map<String, Any?>, method: String = "POST"): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val conn = open(path, method)
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(JsonObject(body.mapValues { (_, v) -> toJson(v) }).toString().toByteArray()) }
            val ok = conn.responseCode in 200..299
            conn.disconnect()
            ok
        }.getOrDefault(false)
    }

    private fun toJson(v: Any?): JsonElement = when (v) {
        null -> JsonNull
        is String -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k.toString() to toJson(x) })
        is Collection<*> -> JsonArray(v.map { toJson(it) })
        else -> JsonPrimitive(v.toString())
    }

    /** POST (or PUT / DELETE) JSON and read the answer. */
    suspend inline fun <reified T> post(path: String, body: Map<String, Any?>, method: String = "POST"): T = json.decodeFromString(postText(path, body, method))

    suspend fun postText(path: String, body: Map<String, Any?>, method: String = "POST"): String = withContext(Dispatchers.IO) {
        val conn = open(path, method)
        try {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(JsonObject(body.mapValues { (_, v) -> toJson(v) }).toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.readText().orEmpty()
            if (code !in 200..299) {
                val message = runCatching { (json.parseToJsonElement(text) as JsonObject)["error"]?.let { (it as JsonPrimitive).content } }.getOrNull()
                throw ApiException(message ?: "Something went wrong ($code).")
            }
            text
        } finally {
            conn.disconnect()
        }
    }

    /** Keeps the session the server sends back (switching or removing accounts). */
    fun keepSession(session: String?) {
        val cm = CookieManager.getInstance()
        if (session == null) {
            cm.setCookie(site, "jm_accounts=; Path=/; Max-Age=0")
        } else {
            cm.setCookie(site, "jm_accounts=$session; Path=/; Secure; HttpOnly; Max-Age=${60 * 60 * 24 * 300}")
        }
        cm.flush()
    }

    /**
     * Sends a file (a content:// address from the picker) straight to Jace's storage, the way the
     * website does. Returns the ticket (its path, and public address for pictures).
     */
    suspend fun upload(context: android.content.Context, uri: android.net.Uri, kind: String, onProgress: (Float) -> Unit = {}): UploadTicket =
        withContext(Dispatchers.IO) {
            val resolver = context.contentResolver
            val type = resolver.getType(uri) ?: if (kind == "video") "video/mp4" else "image/jpeg"
            var name = if (kind == "video") "video.mp4" else "picture.jpg"
            var size = 0L
            resolver.query(uri, null, null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val n = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                    val s = c.getColumnIndex(android.provider.OpenableColumns.SIZE)
                    if (n >= 0) c.getString(n)?.let { name = it }
                    if (s >= 0) size = c.getLong(s)
                }
            }
            val ticket: UploadTicket = json.decodeFromString(postText("/api/uploads", mapOf("kind" to kind, "filename" to name, "content_type" to type, "size" to size)))
            val boundary = "JaceMedia-" + java.util.UUID.randomUUID()
            val head = ("--$boundary\r\nContent-Disposition: form-data; name=\"cacheControl\"\r\n\r\n3600\r\n" +
                "--$boundary\r\nContent-Disposition: form-data; name=\"\"; filename=\"$name\"\r\nContent-Type: $type\r\n\r\n").toByteArray()
            val tail = "\r\n--$boundary--\r\n".toByteArray()
            val conn = URL(ticket.upload_url).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = ticket.method
                conn.doOutput = true
                for ((k, v) in ticket.headers) if (v.isNotEmpty() && !k.equals("content-type", true)) conn.setRequestProperty(k, v)
                conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                if (size > 0) conn.setFixedLengthStreamingMode(head.size + size + tail.size) else conn.setChunkedStreamingMode(1 shl 16)
                conn.outputStream.use { out ->
                    out.write(head)
                    resolver.openInputStream(uri)?.use { input ->
                        val buf = ByteArray(1 shl 16)
                        var sent = 0L
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            sent += n
                            if (size > 0) onProgress(sent.toFloat() / size)
                        }
                    } ?: throw ApiException("Couldn't open that file.")
                    out.write(tail)
                }
                val code = conn.responseCode
                if (code !in 200..299) throw ApiException(if (code == 413) "That file is bigger than Jace allows." else "Upload failed ($code).")
            } finally {
                conn.disconnect()
            }
            onProgress(1f)
            ticket
        }

    fun q(s: String): String = URLEncoder.encode(s, "UTF-8")

    fun signedIn(): Boolean = CookieManager.getInstance().getCookie(site)?.contains("jm_accounts=") == true
}

fun compact(n: Double?): String? {
    n ?: return null
    return when {
        n >= 1e9 -> String.format("%.1fB", n / 1e9)
        n >= 1e6 -> String.format("%.1fM", n / 1e6)
        n >= 1e3 -> String.format("%.1fK", n / 1e3)
        else -> n.toLong().toString()
    }.replace(".0", "")
}
