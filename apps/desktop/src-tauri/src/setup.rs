// Setup and delete, like Jace Launcher: the downloaded file (the Linux AppImage, the Windows .exe, or the
// Mac .app) only runs a setup wizard. It copies itself to the folder you pick, adds the shortcuts you
// want, starts the installed copy, and removes the download. Deleting works from the app's Settings,
// the applications menu (Linux), Installed apps (Windows), or `--uninstall`.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const APP_ID: &str = "com.okjace.jacemedia";
const ICON: &[u8] = include_bytes!("../../app-icon.png");

#[cfg(target_os = "windows")]
const NO_WINDOW: u32 = 0x0800_0000;

fn home() -> PathBuf {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from).unwrap_or_default()
}

/// Where the install record lives.
fn data_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(home).join("Jace Media")
    } else if cfg!(target_os = "macos") {
        home().join("Library/Application Support/Jace Media")
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share")).join("jace-media")
    }
}

/// Where the web engine keeps your sign-in, cache and settings.
fn webview_data() -> Vec<PathBuf> {
    if cfg!(target_os = "windows") {
        vec![std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(home).join(APP_ID)]
    } else if cfg!(target_os = "macos") {
        vec![
            home().join("Library/Application Support").join(APP_ID),
            home().join("Library/WebKit").join(APP_ID),
            home().join("Library/Caches").join(APP_ID),
        ]
    } else {
        let share = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share"));
        let cache = std::env::var_os("XDG_CACHE_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".cache"));
        vec![share.join(APP_ID), cache.join(APP_ID)]
    }
}

fn record_file() -> PathBuf {
    data_dir().join("install.json")
}

fn read_record() -> Option<(PathBuf, Vec<PathBuf>)> {
    let text = fs::read_to_string(record_file()).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let path = PathBuf::from(v.get("path")?.as_str()?);
    let extras = v
        .get("extras")
        .and_then(|e| e.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(PathBuf::from)).collect())
        .unwrap_or_default();
    Some((path, extras))
}

fn write_record(path: &Path, extras: &[PathBuf]) -> std::io::Result<()> {
    fs::create_dir_all(data_dir())?;
    let v = serde_json::json!({
        "path": path.to_string_lossy(),
        "extras": extras.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
        "version": env!("CARGO_PKG_VERSION"),
    });
    fs::write(record_file(), v.to_string())
}

/// The thing that can install itself: the AppImage, the .exe, or the .app folder.
pub fn package() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        return None;
    }
    #[cfg(target_os = "linux")]
    {
        // Only the AppImage installs itself; the .deb / .rpm are installed by the system.
        return std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_file());
    }
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe().ok()?;
        return exe.ancestors().find(|p| p.extension().map(|e| e == "app").unwrap_or(false)).map(Path::to_path_buf);
    }
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe().ok()?;
        // Installed by the old setup program: leave it alone.
        if exe.parent().map(|d| d.join("uninstall.exe").exists()).unwrap_or(false) {
            return None;
        }
        return Some(exe);
    }
    #[allow(unreachable_code)]
    None
}

fn same(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

pub fn installed() -> Option<PathBuf> {
    read_record().map(|(p, _)| p).filter(|p| p.exists())
}

/// True when this is a download that should show setup instead of the app.
pub fn needs_setup() -> bool {
    match package() {
        None => false,
        Some(pkg) => match installed() {
            Some(inst) => !same(&pkg, &inst),
            None => true,
        },
    }
}

#[derive(Serialize)]
pub struct Info {
    platform: &'static str,
    version: &'static str,
    default_dir: String,
    upgrade: bool,
    installed: bool,
}

pub fn default_dir() -> PathBuf {
    if let Some(p) = installed() {
        if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
            if let Some(d) = p.parent() {
                return d.to_path_buf();
            }
        } else if let Some(d) = p.parent() {
            return d.to_path_buf();
        }
    }
    if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(home).join("Programs").join("Jace Media")
    } else if cfg!(target_os = "macos") {
        PathBuf::from("/Applications")
    } else {
        home().join("Applications")
    }
}

pub fn info() -> Info {
    Info {
        platform: if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "mac" } else { "linux" },
        version: env!("CARGO_PKG_VERSION"),
        default_dir: default_dir().to_string_lossy().to_string(),
        upgrade: installed().is_some(),
        installed: installed().is_some(),
    }
}

/// Installs, starts the installed copy, and removes the download. Returns where it went.
pub fn install(dir: &str, menu: bool, desktop: bool) -> Result<PathBuf, String> {
    let pkg = package().ok_or("This copy of Jace Media can't install itself.")?;
    let dir = if dir.trim().is_empty() { default_dir() } else { PathBuf::from(dir.trim()) };
    fs::create_dir_all(&dir).map_err(|e| format!("Couldn't make {}: {e}", dir.display()))?;
    let mut extras: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "linux")]
    let dest = {
        let dest = dir.join("JaceMedia.AppImage");
        if !same(&pkg, &dest) {
            let _ = fs::remove_file(&dest);
            fs::copy(&pkg, &dest).map_err(|e| format!("Couldn't copy the app: {e}"))?;
        }
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&dest, fs::Permissions::from_mode(0o755));
        let share = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share"));
        let icon = share.join("icons/hicolor/512x512/apps").join(format!("{APP_ID}.png"));
        fs::create_dir_all(icon.parent().unwrap()).ok();
        fs::write(&icon, ICON).ok();
        extras.push(icon);
        let entry = format!(
            "[Desktop Entry]\nType=Application\nName=Jace Media\nComment=Videos, Shorts, and posts from everywhere, with no ads\n\
             Exec=\"{0}\" %U\nIcon={APP_ID}\nTerminal=false\nCategories=AudioVideo;Video;Network;\nStartupWMClass=jace-media\n\
             Actions=Uninstall;\n\n[Desktop Action Uninstall]\nName=Delete Jace Media\nExec=\"{0}\" --uninstall-gui\n",
            dest.display()
        );
        if menu {
            let f = share.join("applications").join(format!("{APP_ID}.desktop"));
            fs::create_dir_all(f.parent().unwrap()).ok();
            fs::write(&f, &entry).map_err(|e| format!("Couldn't add the menu entry: {e}"))?;
            extras.push(f);
            let _ = Command::new("update-desktop-database").arg(share.join("applications")).status();
        }
        if desktop {
            let d = Command::new("xdg-user-dir")
                .arg("DESKTOP")
                .output()
                .ok()
                .map(|o| PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
                .filter(|p| !p.as_os_str().is_empty() && *p != home())
                .unwrap_or_else(|| home().join("Desktop"));
            if d.is_dir() {
                let f = d.join(format!("{APP_ID}.desktop"));
                fs::write(&f, &entry).ok();
                let _ = fs::set_permissions(&f, fs::Permissions::from_mode(0o755));
                let _ = Command::new("gio").args(["set"]).arg(&f).args(["metadata::trusted", "true"]).status();
                extras.push(f);
            }
        }
        dest
    };

    #[cfg(target_os = "windows")]
    let dest = {
        use std::os::windows::process::CommandExt;
        let dest = dir.join("Jace Media.exe");
        if !same(&pkg, &dest) {
            let _ = fs::remove_file(&dest);
            fs::copy(&pkg, &dest).map_err(|e| format!("Couldn't copy the app (is it open?): {e}"))?;
        }
        let q = |p: &Path| p.to_string_lossy().replace('\'', "''");
        let mut ps = String::new();
        let mut shortcut = |lnk: String| {
            ps.push_str(&format!(
                "$s=(New-Object -ComObject WScript.Shell).CreateShortcut({lnk});$s.TargetPath='{0}';$s.WorkingDirectory='{1}';$s.Description='Jace Media';$s.Save();",
                q(&dest),
                q(&dir)
            ));
        };
        if menu {
            shortcut("([Environment]::GetFolderPath('Programs')+'\\Jace Media.lnk')".into());
        }
        if desktop {
            shortcut("([Environment]::GetFolderPath('Desktop')+'\\Jace Media.lnk')".into());
        }
        if !ps.is_empty() {
            let _ = Command::new("powershell")
                .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps])
                .creation_flags(NO_WINDOW)
                .status();
        }
        let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\JaceMedia";
        let uninstall = format!("\"{}\" --uninstall-gui", dest.display());
        let quiet = format!("\"{}\" --uninstall", dest.display());
        let icon = format!("{},0", dest.display());
        let loc = dir.display().to_string();
        for (name, val) in [
            ("DisplayName", "Jace Media"),
            ("DisplayVersion", env!("CARGO_PKG_VERSION")),
            ("Publisher", "okjace"),
            ("DisplayIcon", icon.as_str()),
            ("InstallLocation", loc.as_str()),
            ("UninstallString", uninstall.as_str()),
            ("QuietUninstallString", quiet.as_str()),
            ("URLInfoAbout", "https://jace-media.vercel.app/apps"),
        ] {
            let _ = Command::new("reg").args(["add", key, "/v", name, "/d", val, "/f"]).creation_flags(NO_WINDOW).status();
        }
        for name in ["NoModify", "NoRepair"] {
            let _ = Command::new("reg").args(["add", key, "/v", name, "/t", "REG_DWORD", "/d", "1", "/f"]).creation_flags(NO_WINDOW).status();
        }
        dest
    };

    #[cfg(target_os = "macos")]
    let dest = {
        let mut dir = dir;
        let mut dest = dir.join("Jace Media.app");
        if !same(&pkg, &dest) {
            let _ = fs::remove_dir_all(&dest);
            let ok = Command::new("ditto").arg(&pkg).arg(&dest).status().map(|s| s.success()).unwrap_or(false);
            if !ok {
                // /Applications needs an admin; fall back to your own Applications folder.
                dir = home().join("Applications");
                fs::create_dir_all(&dir).ok();
                dest = dir.join("Jace Media.app");
                let _ = fs::remove_dir_all(&dest);
                let ok = Command::new("ditto").arg(&pkg).arg(&dest).status().map(|s| s.success()).unwrap_or(false);
                if !ok {
                    return Err("Couldn't copy the app. Pick a folder you can write to.".into());
                }
            }
        }
        // Stops macOS from calling the downloaded app "damaged".
        let _ = Command::new("xattr").args(["-cr"]).arg(&dest).status();
        let _ = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
            .args(["-f"])
            .arg(&dest)
            .status();
        if menu {
            // "menu" means the Dock on a Mac.
            let item = format!(
                "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>{}</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>",
                dest.display()
            );
            let _ = Command::new("defaults").args(["write", "com.apple.dock", "persistent-apps", "-array-add", &item]).status();
            let _ = Command::new("killall").arg("Dock").status();
        }
        if desktop {
            let link = home().join("Desktop/Jace Media");
            let _ = fs::remove_file(&link);
            if std::os::unix::fs::symlink(&dest, &link).is_ok() {
                extras.push(link);
            }
        }
        dest
    };

    write_record(&dest, &extras).map_err(|e| format!("Couldn't save the install: {e}"))?;
    Ok(dest)
}

/// Starts the installed copy, then removes the download once this copy has quit.
pub fn launch_installed(dest: &Path) {
    let pkg = package();
    #[cfg(target_os = "linux")]
    {
        // Don't hand the new copy this AppImage's private settings.
        let mut cmd = Command::new(dest);
        for v in [
            "APPIMAGE", "APPDIR", "OWD", "ARGV0", "LD_LIBRARY_PATH", "LD_PRELOAD", "GST_PLUGIN_SYSTEM_PATH", "GST_PLUGIN_SYSTEM_PATH_1_0",
            "GST_PLUGIN_PATH", "GST_PLUGIN_PATH_1_0", "GST_PLUGIN_SCANNER", "GST_PLUGIN_SCANNER_1_0", "GST_REGISTRY_REUSE_PLUGIN_SCANNER",
            "GIO_MODULE_DIR", "GIO_EXTRA_MODULES", "GDK_PIXBUF_MODULE_FILE", "GDK_PIXBUF_MODULEDIR", "GTK_PATH", "GTK_EXE_PREFIX",
            "GTK_DATA_PREFIX", "GTK_IM_MODULE_FILE", "GSETTINGS_SCHEMA_DIR", "PYTHONHOME", "PYTHONPATH", "PERLLIB",
        ] {
            cmd.env_remove(v);
        }
        let _ = cmd.spawn();
        if let Some(p) = pkg {
            if !same(&p, dest) {
                let _ = fs::remove_file(p);
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new(dest).spawn();
        if let Some(p) = pkg {
            if !same(&p, dest) {
                let cmd = format!("ping -n 4 127.0.0.1 >nul & del /f /q \"{}\"", p.display());
                let _ = Command::new("cmd").args(["/c", &cmd]).creation_flags(NO_WINDOW).spawn();
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg("-n").arg(dest).spawn();
        if let Some(p) = pkg {
            // Can't remove it from a mounted disk image, and that's fine.
            if !same(&p, dest) && !p.starts_with("/Volumes") {
                let _ = Command::new("sh").args(["-c", "sleep 3; rm -rf \"$0\"", &p.to_string_lossy()]).spawn();
            }
        }
    }
}

/// Deletes the app, its shortcuts, and (with `everything`) your sign-in and settings.
pub fn uninstall(everything: bool) -> Result<(), String> {
    let rec = read_record();
    let path = rec.as_ref().map(|(p, _)| p.clone()).or_else(package);
    if let Some((_, extras)) = &rec {
        for e in extras {
            let _ = fs::remove_file(e);
        }
    }

    #[cfg(target_os = "linux")]
    {
        let share = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share"));
        let _ = fs::remove_file(share.join("applications").join(format!("{APP_ID}.desktop")));
        let _ = fs::remove_file(share.join("icons/hicolor/512x512/apps").join(format!("{APP_ID}.png")));
        if let Some(p) = &path {
            let _ = fs::remove_file(p);
        }
        if everything {
            for d in webview_data() {
                let _ = fs::remove_dir_all(d);
            }
        }
        let _ = fs::remove_dir_all(data_dir());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let ps = "Remove-Item -Force -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Programs')+'\\Jace Media.lnk'),([Environment]::GetFolderPath('Desktop')+'\\Jace Media.lnk')";
        let _ = Command::new("powershell").args(["-NoProfile", "-Command", ps]).creation_flags(NO_WINDOW).status();
        let _ = Command::new("reg")
            .args(["delete", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\JaceMedia", "/f"])
            .creation_flags(NO_WINDOW)
            .status();
        // The app is still running, so the files go once it has quit.
        let mut later = String::from("ping -n 4 127.0.0.1 >nul");
        if let Some(p) = &path {
            later.push_str(&format!(" & del /f /q \"{}\"", p.display()));
            if let Some(d) = p.parent() {
                later.push_str(&format!(" & rmdir \"{}\"", d.display()));
            }
        }
        later.push_str(&format!(" & rmdir /s /q \"{}\"", data_dir().display()));
        if everything {
            for d in webview_data() {
                later.push_str(&format!(" & rmdir /s /q \"{}\"", d.display()));
            }
        }
        let _ = Command::new("cmd").args(["/c", &later]).creation_flags(NO_WINDOW).spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let mut targets: Vec<String> = Vec::new();
        if let Some(p) = &path {
            targets.push(p.to_string_lossy().to_string());
        }
        targets.push(data_dir().to_string_lossy().to_string());
        if everything {
            targets.extend(webview_data().iter().map(|d| d.to_string_lossy().to_string()));
        }
        let mut args = vec!["-c".to_string(), "sleep 2; rm -rf \"$@\"".to_string(), "sh".to_string()];
        args.extend(targets);
        let _ = Command::new("sh").args(&args).spawn();
    }
    let _ = path;
    Ok(())
}
