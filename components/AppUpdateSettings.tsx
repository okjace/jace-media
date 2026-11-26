"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/Switch";

type Bridge = {
  version: () => string;
  platform: () => string;
  autoUpdate: () => boolean;
  setAutoUpdate: (on: boolean) => void;
  checkForUpdates: () => void;
};

declare global {
  interface Window {
    JaceMediaApp?: Bridge;
  }
}

const NAMES: Record<string, string> = { android: "Android", androidtv: "Android TV", ios: "iPhone" };

/** Inside the Jace Media app: its version and update settings (automatic or manual). Hidden in a browser. */
export function AppUpdateSettings() {
  const [app, setApp] = useState<{ version: string; platform: string; auto: boolean } | null>(null);

  useEffect(() => {
    const b = window.JaceMediaApp;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (b) setApp({ version: b.version(), platform: b.platform(), auto: b.autoUpdate() });
  }, []);

  if (!app) return null;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-accent/40 bg-accent/[.06] p-5">
      <div>
        <h2 className="font-semibold">This app</h2>
        <p className="text-sm text-muted">
          Jace Media for {NAMES[app.platform] ?? app.platform}, version {app.version}. Jace Media itself always loads the newest version; updates
          are only for the app around it.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-medium">Automatic updates</span>
          <span className="block text-sm text-muted">
            {app.auto
              ? "Checks every time the app opens, and asks before installing."
              : "Manual: only when you press Check for updates."}
          </span>
        </span>
        <Switch
          checked={app.auto}
          label="Automatic updates"
          onChange={(on) => {
            window.JaceMediaApp?.setAutoUpdate(on);
            setApp({ ...app, auto: on });
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => window.JaceMediaApp?.checkForUpdates()}
        className="self-start rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
      >
        Check for updates
      </button>
    </section>
  );
}
