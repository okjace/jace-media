// Jace Media for Windows, Mac, and Linux: a small native window (Tauri, using the
// computer's own web engine, so the download is a few MB) that opens the live
// site. New Jace Media features arrive without an app update.
//
// The downloaded file only runs setup (see setup.rs), like Jace Launcher.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod setup;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const SITE: &str = "https://jace-media.vercel.app";

/// Pages that open inside the app; everything else opens in your browser.
/// YouTube's player and Cloudflare (live streams) load their own frames, so they stay inside too.
fn stays_inside(url: &Url) -> bool {
    match url.scheme() {
        "about" | "data" | "blob" | "tauri" => return true,
        "https" | "http" if url.host_str() == Some("tauri.localhost") => return true,
        "https" => {}
        _ => return false,
    }
    let host = url.host_str().unwrap_or("");
    let under = |d: &str| host == d || host.ends_with(&format!(".{d}"));
    host == "jace-media.vercel.app"
        || host == "jaceo.vercel.app"
        || under("youtube-nocookie.com")
        || under("youtube.com")
        || under("ytimg.com")
        || under("googlevideo.com")
        || under("google.com")
        || under("gstatic.com")
        || under("doubleclick.net")
        || under("cloudflare.com")
        || under("bsky.app")
}

/// Opens the setup window: "install" or "uninstall".
fn open_setup(app: &AppHandle, mode: &str) {
    if let Some(w) = app.get_webview_window("setup") {
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "setup", WebviewUrl::App(format!("setup.html?mode={mode}").into()))
        .title(if mode == "uninstall" { "Delete Jace Media" } else { "Set up Jace Media" })
        .inner_size(620.0, 520.0)
        .resizable(false)
        .center()
        .build();
}

fn open_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
        return Ok(());
    }
    let handle = app.clone();
    let platform = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "mac" } else { "linux" };
    // Lets the site's Settings show "Delete the Jace Media app".
    let script = format!(
        "window.jaceDesktop = {{ version: \"{}\", platform: \"{platform}\", canDelete: {} }};",
        env!("CARGO_PKG_VERSION"),
        setup::installed().is_some()
    );
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SITE.parse().expect("site url")))
        .title("Jace Media")
        .inner_size(1280.0, 820.0)
        .min_inner_size(380.0, 520.0)
        .initialization_script(&script)
        .on_navigation(move |url| {
            // The site asks for app things with jacemedia-app:// links.
            if url.scheme() == "jacemedia-app" {
                let h = handle.clone();
                let what = url.host_str().unwrap_or("").to_string();
                let _ = handle.run_on_main_thread(move || {
                    if what == "uninstall" {
                        open_setup(&h, "uninstall");
                    }
                });
                return false;
            }
            if stays_inside(url) {
                true
            } else {
                let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                false
            }
        })
        .build()?;
    Ok(())
}

#[tauri::command]
fn setup_info() -> setup::Info {
    setup::info()
}

#[tauri::command]
async fn setup_install(app: AppHandle, dir: String, menu: bool, desktop: bool) -> Result<(), String> {
    let dest = tauri::async_runtime::spawn_blocking(move || setup::install(&dir, menu, desktop))
        .await
        .map_err(|e| e.to_string())??;
    setup::launch_installed(&dest);
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn setup_uninstall(app: AppHandle, everything: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || setup::uninstall(everything))
        .await
        .map_err(|e| e.to_string())??;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn setup_cancel(app: AppHandle) {
    // Cancelling setup of a download closes it; cancelling Delete goes back to the app.
    if setup::needs_setup() || app.get_webview_window("main").is_none() {
        app.exit(0);
    } else if let Some(w) = app.get_webview_window("setup") {
        let _ = w.close();
    }
}

fn main() {
    // Linux: WebKitGTK's GPU buffer sharing crashes the app on many graphics drivers as soon
    // as a video plays (blank or closed window). Software buffers are fast enough for video.
    #[cfg(target_os = "linux")]
    unsafe {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--uninstall") {
        let _ = setup::uninstall(args.iter().any(|a| a == "--purge"));
        return;
    }
    let uninstall_gui = args.iter().any(|a| a == "--uninstall-gui");

    tauri::Builder::default()
        // Opening the app again just brings the open window to the front.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--uninstall-gui") {
                open_setup(app, "uninstall");
            } else if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        // Remembers the window's size and place.
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["setup"]).build())
        .invoke_handler(tauri::generate_handler![setup_info, setup_install, setup_uninstall, setup_cancel])
        .setup(move |app| {
            let handle = app.handle().clone();
            if uninstall_gui {
                open_setup(&handle, "uninstall");
            } else if setup::needs_setup() {
                open_setup(&handle, "install");
            } else {
                open_main(&handle)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("couldn't start Jace Media");
}
