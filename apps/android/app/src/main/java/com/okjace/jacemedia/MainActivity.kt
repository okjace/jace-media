package com.okjace.jacemedia

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.UiModeManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Jace Media for Android phones and Android TV: the website, full screen,
 * with what an app adds: fullscreen video, uploads, downloads, the back
 * button, opening other websites in the browser, and updates.
 */
open class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var updater: Updater

    /** Sites that stay inside the app: Jace Media and Jace (for signing in). */
    private val inside = setOf("jace-media.vercel.app", "jaceo.vercel.app")

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        val uris = when {
            result.resultCode != RESULT_OK || data == null -> null
            data.clipData != null -> Array(data.clipData!!.itemCount) { data.clipData!!.getItemAt(it).uri }
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        fileCallback?.onReceiveValue(uris)
        fileCallback = null
    }

    protected val isTv: Boolean
        get() = (getSystemService(Context.UI_MODE_SERVICE) as UiModeManager).currentModeType == Configuration.UI_MODE_TYPE_TELEVISION

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Phones and tablets get the native app; TVs (and Jace Media links) stay here.
        if (this !is WebScreenActivity && !isTv && intent?.data == null) {
            updater = Updater(this)
            if (updater.automatic) updater.check(manual = false)
            startActivity(Intent(this, AppActivity::class.java))
            finish()
            return
        }
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#111317")
        window.navigationBarColor = Color.parseColor("#111317")
        updater = Updater(this)

        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#111317")) }
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#111317"))
            isFocusable = true
            isFocusableInTouchMode = true
        }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            allowFileAccess = false
            // Lets Jace Media know it's in the app (for update settings) and on a TV (for the TV layout).
            userAgentString = "$userAgentString JaceMediaApp/${BuildConfig.VERSION_NAME} (${if (isTv) "AndroidTV" else "Android"})"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.addJavascriptInterface(Bridge(), "JaceMediaApp")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (!request.isForMainFrame) return false
                // Signing in from the native app finished: the session is in the cookies now, so go back.
                if (url.scheme == "jacemedia") {
                    CookieManager.getInstance().flush()
                    finish()
                    return true
                }
                if (url.scheme == "https" && url.host in inside) return false
                // Everything else (other websites, mail links…) opens outside the app.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                // A video went fullscreen: show it over everything, sideways.
                fullscreenView?.let { onHideCustomView() }
                fullscreenView = view
                fullscreenCallback = callback
                root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                web.visibility = View.GONE
                WindowInsetsControllerCompat(window, root).apply {
                    hide(WindowInsetsCompat.Type.systemBars())
                    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                if (!isTv) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            }

            override fun onHideCustomView() {
                fullscreenView?.let { root.removeView(it) }
                fullscreenView = null
                web.visibility = View.VISIBLE
                WindowInsetsControllerCompat(window, root).show(WindowInsetsCompat.Type.systemBars())
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                fullscreenCallback?.onCustomViewHidden()
                fullscreenCallback = null
            }

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    pickFiles.launch(params.createIntent().apply { putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) })
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }

        // Downloads (Jace videos): saved to the Downloads folder.
        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setMimeType(mimeType)
                .addRequestHeader("User-Agent", userAgent)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, "Downloading $name", Toast.LENGTH_SHORT).show()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    fullscreenView != null -> web.webChromeClient?.onHideCustomView()
                    web.canGoBack() -> web.goBack()
                    else -> {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })

        // TVs open Jace Media's own TV interface (made for the remote); phones open the full site.
        val home = if (isTv) "${BuildConfig.SITE}/tv-app/index.html" else BuildConfig.SITE
        val start = intent?.getStringExtra("path")?.let { BuildConfig.SITE + it }
            ?: intent?.data?.takeIf { it.host == "jace-media.vercel.app" }?.toString()
            ?: home
        if (savedInstanceState == null) web.loadUrl(start) else web.restoreState(savedInstanceState)
        if (updater.automatic && this !is WebScreenActivity) updater.check(manual = false)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.takeIf { it.host == "jace-media.vercel.app" }?.let { web.loadUrl(it.toString()) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    /** What the website can ask the app (window.JaceMediaApp). */
    inner class Bridge {
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun platform(): String = if (isTv) "androidtv" else "android"
        @JavascriptInterface fun autoUpdate(): Boolean = updater.automatic
        @JavascriptInterface fun setAutoUpdate(on: Boolean) {
            updater.automatic = on
        }
        @JavascriptInterface fun checkForUpdates() {
            runOnUiThread { updater.check(manual = true) }
        }
    }
}
