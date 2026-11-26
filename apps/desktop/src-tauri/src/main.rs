// Jace Media for Windows, Mac, and Linux: a small native window (Tauri, using the
// computer's own web engine, so the download is a few MB) that opens the live
// site. New Jace Media features arrive without an app update.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const SITE: &str = "https://jace-media.vercel.app";

/// Pages that open inside the app; everything else opens in your browser.
fn stays_inside(url: &Url) -> bool {
    match url.scheme() {
        "about" | "data" | "blob" => return true,
        "https" => {}
        _ => return false,
    }
    let host = url.host_str().unwrap_or("");
    host == "jace-media.vercel.app" || host == "jaceo.vercel.app" || host.ends_with("youtube-nocookie.com") || host == "www.youtube.com"
}

fn main() {
    tauri::Builder::default()
        // Opening the app again just brings the open window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        // Remembers the window's size and place.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SITE.parse().expect("site url")))
                .title("Jace Media")
                .inner_size(1280.0, 820.0)
                .min_inner_size(380.0, 520.0)
                .on_navigation(move |url| {
                    if stays_inside(url) {
                        true
                    } else {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                        false
                    }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("couldn't start Jace Media");
}
