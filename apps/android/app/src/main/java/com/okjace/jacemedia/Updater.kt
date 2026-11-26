package com.okjace.jacemedia

import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Updates for the app itself (the website inside it always updates on its own).
 *
 * Automatic: checks each time the app opens; when there's a newer version it
 * downloads it and asks to install. Manual: only when you press "Check for
 * updates" (in Jace Media → Apps). The newest version comes from
 * jace-media.vercel.app/api/app-version, which reads the GitHub releases.
 */
class Updater(private val activity: Activity) {
    private val prefs = activity.getSharedPreferences("updates", Context.MODE_PRIVATE)

    var automatic: Boolean
        get() = prefs.getBoolean("automatic", true)
        set(value) = prefs.edit().putBoolean("automatic", value).apply()

    fun check(manual: Boolean) {
        thread {
            val latest = try {
                val conn = URL("${BuildConfig.SITE}/api/app-version").openConnection() as HttpURLConnection
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                JSONObject(body).optJSONObject("android")
            } catch (_: Exception) {
                null
            }
            activity.runOnUiThread {
                if (latest == null) {
                    if (manual) toast("Couldn't check for updates. Try again later.")
                    return@runOnUiThread
                }
                val code = latest.optInt("versionCode")
                val version = latest.optString("version")
                val url = latest.optString("url")
                if (code <= BuildConfig.VERSION_CODE || url.isBlank()) {
                    if (manual) toast("Jace Media is up to date (${BuildConfig.VERSION_NAME}).")
                    return@runOnUiThread
                }
                if (activity.isFinishing) return@runOnUiThread
                AlertDialog.Builder(activity)
                    .setTitle("Update Jace Media?")
                    .setMessage("Version $version is ready (you have ${BuildConfig.VERSION_NAME}).")
                    .setPositiveButton("Update") { _, _ -> download(url, version) }
                    .setNegativeButton("Later", null)
                    .show()
            }
        }
    }

    private fun download(url: String, version: String) {
        // Android asks once for permission to install apps from Jace Media.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            toast("Allow Jace Media to install updates, then press Update again.")
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
            return
        }
        val name = "JaceMedia-$version.apk"
        val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return
        File(dir, name).delete()
        val dm = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val id = dm.enqueue(
            DownloadManager.Request(Uri.parse(url))
                .setTitle("Jace Media $version")
                .setMimeType("application/vnd.android.package-archive")
                .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name),
        )
        toast("Downloading the update…")
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return
                activity.unregisterReceiver(this)
                install(File(dir, name))
            }
        }
        ContextCompat.registerReceiver(activity, receiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED)
    }

    private fun install(apk: File) {
        if (!apk.exists()) {
            toast("The update didn't download. Try again.")
            return
        }
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", apk)
        activity.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    private fun toast(text: String) = Toast.makeText(activity, text, Toast.LENGTH_LONG).show()
}
