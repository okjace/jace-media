"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { rate } from "@/lib/rate-client";

/** The ⋮ menu on a video: "Not interested" and "Don't recommend channel". */
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
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    // Hide the whole tile once it's dismissed.
    if (gone) box.current?.closest("[data-video-tile]")?.setAttribute("hidden", "");
  }, [gone]);

  if (!current) return null;

  async function hide(kind: "video" | "channel") {
    setOpen(false);
    const res = await fetch("/api/hidden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ref: kind === "video" ? `${source}:${id}` : `${source}:${channelId}` }),
    });
    if (res.ok) {
      setGone(true);
      showNotice({ kind: "info", text: kind === "video" ? "Got it. You'll see less like this." : `You won't be recommended ${channelName} anymore.` });
    }
  }

  async function watchLater() {
    setOpen(false);
    const res = await fetch("/api/playlists/watch-later/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video: { source, id, title, thumbnail, channelId, channelName, short } }),
    });
    showNotice(res.ok ? { kind: "info", text: "Saved to Watch Later." } : { kind: "error", text: "Couldn't save that." });
  }

  async function rateIt(rating: 1 | -1) {
    setOpen(false);
    if (!(await rate(`${source}:${id}`, rating))) return;
    if (rating === -1) {
      setGone(true);
      showNotice({ kind: "info", text: "Thanks. It's hidden for you, and your rating helps hide it for others." });
    } else showNotice({ kind: "info", text: "Thanks for rating it appropriate." });
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted opacity-70 hover:bg-foreground/[.08] hover:text-foreground group-hover:opacity-100"
      >
        ⋮
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-xl shadow-black/30">
          <button type="button" role="menuitem" onClick={watchLater} className="block w-full px-4 py-2 text-left hover:bg-foreground/[.06]">
            🕒 Save to Watch Later
          </button>
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={() => hide("video")} className="block w-full px-4 py-2 text-left hover:bg-foreground/[.06]">
            Not interested
          </button>
          <button type="button" role="menuitem" onClick={() => hide("channel")} className="block w-full px-4 py-2 text-left hover:bg-foreground/[.06]">
            Don&apos;t recommend channel
          </button>
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={() => rateIt(1)} className="block w-full px-4 py-2 text-left hover:bg-foreground/[.06]">
            👍 Rate appropriate
          </button>
          <button type="button" role="menuitem" onClick={() => rateIt(-1)} className="block w-full px-4 py-2 text-left text-danger hover:bg-danger/10">
            🚩 Rate inappropriate
          </button>
        </div>
      )}
    </div>
  );
}
