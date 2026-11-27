package com.okjace.jacemedia

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
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
@Serializable data class Media(val kind: String = "image", val url: String? = null, val thumb: String? = null)

@Serializable
data class Post(
    val network: String,
    val id: String,
    val text: String = "",
    val title: String? = null,
    val createdAt: String? = null,
    val author: Author,
    val media: List<Media> = emptyList(),
)

@Serializable data class Account(val sub: String, val handle: String, val name: String, val picture: String? = null)
@Serializable data class Me(val account: Account? = null, val others: List<Account> = emptyList())
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
        else -> JsonPrimitive(v.toString())
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
