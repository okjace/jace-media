"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { signInHref, useApp } from "@/components/AppProvider";
import type { FollowTarget } from "@/lib/follow";

/** Subscribe to a YouTube or Jace channel, or follow a person or Lemmy community. */
export function FollowButton({
  target,
  initial,
  size = "md",
  label = "Follow",
}: {
  target: { kind: FollowTarget["kind"] | "youtube"; ref: string; name: string; picture?: string | null };
  initial: boolean;
  size?: "sm" | "md";
  label?: "Follow" | "Subscribe";
}) {
  const { current, showNotice } = useApp();
  const pathname = usePathname();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!current) {
      window.location.assign(signInHref(pathname));
      return;
    }
    setBusy(true);
    const next = !on;
    setOn(next);
    const res = await fetch("/api/subscriptions", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    });
    setBusy(false);
    if (!res.ok) {
      setOn(!next);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      showNotice({ kind: "error", text: data.error ?? "Couldn't save that. Try again." });
    }
  }

  const done = label === "Subscribe" ? "Subscribed" : "Following";
  const pad = size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      className={`shrink-0 rounded-full font-medium transition-colors ${pad} ${
        on ? "bg-foreground/[.08] text-foreground hover:bg-foreground/[.12]" : "bg-foreground text-background hover:opacity-90"
      }`}
    >
      {on ? done : label}
    </button>
  );
}
