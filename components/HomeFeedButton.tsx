"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";

/** Makes a custom feed your Home (or goes back to For you). */
export function HomeFeedButton({ feedId }: { feedId: string }) {
  const { extensions, showNotice } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isHome = extensions.homeFeed === feedId;

  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/extensions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...extensions, homeFeed: isHome ? null : feedId }),
    });
    setBusy(false);
    if (!res.ok) {
      showNotice({ kind: "error", text: "Couldn't change your Home. Try again." });
      return;
    }
    showNotice({ kind: "info", text: isHome ? "Home is For you again." : "This feed is now your Home." });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={isHome}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
        isHome ? "bg-accent/15 text-accent hover:bg-accent/25" : "bg-accent text-on-accent hover:bg-accent-hover"
      }`}
    >
      {isHome ? "✓ Your Home" : "Use as my Home"}
    </button>
  );
}
