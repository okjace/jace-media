# Jace Media desktop

A small native app for Windows, Mac, and Linux made with [Tauri](https://tauri.app). It uses the
computer's own web engine (WebView2, WKWebView, WebKitGTK), so it's a few MB instead of a whole browser,
and opens the live site, so new features arrive without an app update. Links to other websites open in
your browser; the window remembers its size; opening it twice brings the open window forward.

Built by `.github/workflows/apps.yml` (icons are made from `app-icon.png` with `tauri icon`).

Build it yourself: install Rust and Node, then

```sh
cd apps/desktop
npx @tauri-apps/cli@2 icon app-icon.png
npx @tauri-apps/cli@2 build
```
