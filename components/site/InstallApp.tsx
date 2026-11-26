"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Registers the service worker, and shows "Install app" when the browser
 * offers it (Chrome, Edge, Android). On iPhone and iPad it explains Add to
 * Home Screen instead. Hidden once installed.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt && !ios) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } else setHelp((h) => !h);
  }

  return (
    <div className="px-1">
      <button type="button" onClick={install} className="flex w-full items-center gap-4 rounded-xl px-3 py-2 text-sm text-foreground/85 hover:bg-foreground/[.06]">
        <Icon name="import" />
        Install app
      </button>
      {help && (
        <p className="mx-3 mb-2 rounded-xl bg-foreground/[.06] p-3 text-xs leading-relaxed text-muted">
          In Safari, tap the Share button, then <b className="text-foreground">Add to Home Screen</b>.
        </p>
      )}
    </div>
  );
}
