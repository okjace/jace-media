"use client";

import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    /** Set by the Windows / Mac / Linux app (apps/desktop). */
    jaceDesktop?: { version: string; platform: string; canDelete: boolean };
  }
}

const noop = () => () => {};

/** In the desktop app: "Delete Jace Media app", which opens the app's own Delete window. */
export function DesktopDelete({ className, onClick }: { className?: string; onClick?: () => void }) {
  const can = useSyncExternalStore(noop, () => !!window.jaceDesktop?.canDelete, () => false);
  if (!can) return null;
  return (
    <a href="jacemedia-app://uninstall" role="menuitem" onClick={onClick} className={className}>
      Delete Jace Media app
    </a>
  );
}
