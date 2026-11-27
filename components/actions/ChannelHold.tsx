"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signInHref, useApp } from "@/components/AppProvider";
import { useContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import type { FollowTarget } from "@/lib/follow";

/**
 * Press and hold (or right-click) a channel for Subscribe / Unsubscribe and
 * Go to channel. On phones this is how you subscribe; computers also get a
 * Subscribe button next to the channel.
 */
export function ChannelHold({
  target,
  initial,
  href,
  children,
  className,
}: {
  target: { kind: FollowTarget["kind"] | "youtube"; ref: string; name: string; picture?: string | null };
  initial: boolean;
  href: string | null;
  children: ReactNode;
  className?: string;
}) {
  const { current, showNotice } = useApp();
  const pathname = usePathname();
  const [on, setOn] = useState(initial);
  const word = target.kind === "youtube" || target.kind === "jace" ? "Subscribe" : "Follow";

  async function toggle() {
    if (!current) {
      window.location.assign(signInHref(pathname));
      return;
    }
    const next = !on;
    setOn(next);
    const res = await fetch("/api/subscriptions", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    });
    if (!res.ok) {
      setOn(!next);
      showNotice({ kind: "error", text: "Couldn't do that. Try again." });
    } else showNotice({ kind: "info", text: next ? `${word}d to ${target.name}.` : `Un${word.toLowerCase()}d from ${target.name}.` });
  }

  const { props, menu } = useContextMenu((): MenuItem[] => [
    { label: on ? `Un${word.toLowerCase()} from ${target.name}` : `${word} to ${target.name}`, icon: on ? "✓" : "＋", onSelect: () => void toggle() },
    ...(href ? [{ label: `Go to ${target.name}`, icon: "👤", href } as MenuItem] : []),
  ]);

  return (
    <div {...props} className={className} style={{ WebkitTouchCallout: "none" }}>
      {children}
      {menu}
    </div>
  );
}
