"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { copyText, MenuAt, type MenuItem } from "@/components/ui/ContextMenu";
import { rate } from "@/lib/rate-client";

/**
 * A video's menu: the ⋮ button, and right-click (or press and hold) anywhere
 * on the video's tile. Save to Watch Later, Not interested, Don't recommend
 * channel, rating, copy link, share, and open in a new tab.
 */
export function VideoMenu({
  source,
  id,
  channelId,
  channelName,
  title = "",
  thumbnail = null,
  short = false,
}: {
  source: string;
  id: string;
  channelId: string;
  channelName: string;
  title?: string;
  thumbnail?: string | null;
  short?: boolean;
}) {
  const { current, showNotice } = useApp();
  // Hiding something refreshes saved pages, so it doesn't come back when you go back to them.
  const router = useRouter();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [gone, setGone] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const path = short ? `/shorts?v=${source}:${encodeURIComponent(id)}` : `/watch/${source}/${encodeURIComponent(id)}`;
  const close = useCallback(() => setAt(null), []);

  // Right-click or press-and-hold anywhere on this video's tile opens the same menu.
  useEffect(() => {
    const tile = button.current?.closest<HTMLElement>("[data-video-tile]");
    if (!tile) return;
    let hold: ReturnType<typeof setTimeout> | null = null;
    let start = { x: 0, y: 0 };
    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      setAt({ x: e.clientX, y: e.clientY });
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      hold = setTimeout(() => setAt({ x: t.clientX, y: t.clientY }), 550);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (hold && (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10)) {
        clearTimeout(hold);
        hold = null;
      }
    };
    const onEnd = () => {
      if (hold) clearTimeout(hold);
      hold = null;
    };
    tile.addEventListener("contextmenu", onMenu);
    tile.addEventListener("touchstart", onStart, { passive: true });
    tile.addEventListener("touchmove", onMove, { passive: true });
    tile.addEventListener("touchend", onEnd);
    tile.addEventListener("touchcancel", onEnd);
    return () => {
      tile.removeEventListener("contextmenu", onMenu);
      tile.removeEventListener("touchstart", onStart);
      tile.removeEventListener("touchmove", onMove);
      tile.removeEventListener("touchend", onEnd);
      tile.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  useEffect(() => {
    // Hide the whole tile once it's dismissed.
    if (gone) button.current?.closest("[data-video-tile]")?.setAttribute("hidden", "");
  }, [gone]);

  async function hide(kind: "video" | "channel") {
    const res = await fetch("/api/hidden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ref: kind === "video" ? `${source}:${id}` : `${source}:${channelId}` }),
    });
    if (res.ok) {
      setGone(true);
      router.refresh();
      showNotice({ kind: "info", text: kind === "video" ? "Got it. You'll see less like this." : `You won't be recommended ${channelName} anymore.` });
    }
  }

  async function watchLater() {
    const res = await fetch("/api/playlists/watch-later/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video: { source, id, title, thumbnail, channelId, channelName, short } }),
    });
    showNotice(res.ok ? { kind: "info", text: "Saved to Watch Later." } : { kind: "error", text: "Couldn't save that." });
  }

  async function rateIt(rating: 1 | -1) {
    if (!(await rate(`${source}:${id}`, rating))) return;
    if (rating === -1) {
      setGone(true);
      router.refresh();
      showNotice({ kind: "info", text: "Thanks. It's hidden for you, and your rating helps hide it for others." });
    } else showNotice({ kind: "info", text: "Thanks for rating it appropriate." });
  }

  const items = (): MenuItem[] => {
    const url = `${window.location.origin}${path}`;
    const list: MenuItem[] = [];
    if (current) {
      list.push({ label: "Save to Watch Later", icon: "🕒", onSelect: watchLater }, "divider");
      list.push({ label: "Not interested", icon: "🚫", onSelect: () => hide("video") });
      list.push({ label: "Don't recommend channel", icon: "⊘", onSelect: () => hide("channel") }, "divider");
    }
    list.push({ label: "Open in new tab", icon: "↗", href: path, newTab: true });
    if (channelId) list.push({ label: `Go to ${channelName}`, icon: "👤", href: `/channel/${source}/${encodeURIComponent(channelId)}` });
    list.push({
      label: "Copy link",
      icon: "🔗",
      onSelect: async () => showNotice((await copyText(url)) ? { kind: "info", text: "Link copied." } : { kind: "error", text: "Couldn't copy the link." }),
    });
    if (typeof navigator !== "undefined" && "share" in navigator) {
      list.push({ label: "Share…", icon: "📤", onSelect: () => navigator.share({ title, url }).catch(() => {}) });
    }
    if (current) {
      list.push("divider", { label: "Rate appropriate", icon: "👍", onSelect: () => rateIt(1) }, { label: "Rate inappropriate", icon: "🚩", onSelect: () => rateIt(-1), danger: true });
    }
    return list;
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        onClick={() => {
          const r = button.current!.getBoundingClientRect();
          setAt(at ? null : { x: r.right - 224, y: r.bottom + 4 });
        }}
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={!!at}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted opacity-70 hover:bg-foreground/[.08] hover:text-foreground group-hover:opacity-100"
      >
        ⋮
      </button>
      {at && <MenuAt x={at.x} y={at.y} items={items()} onClose={close} />}
    </div>
  );
}
