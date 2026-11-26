"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FollowButton } from "@/components/actions/FollowButton";
import { signInHref, useApp } from "@/components/AppProvider";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import type { VideoCard } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";

function RailButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className="group flex flex-col items-center gap-1 text-xs text-muted">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-colors ${
          active ? "bg-accent text-on-accent" : "bg-foreground/[.08] text-foreground group-hover:bg-foreground/[.14]"
        }`}
      >
        {children}
      </span>
      {label}
    </button>
  );
}

/**
 * Shorts, one at a time, in one player that's reused for every Short, so
 * moving on is instant: scroll, swipe, ↑/↓, or the arrow buttons.
 */
export function ShortsPlayer({ shorts: initial, start = 0, followed = [] }: { shorts: VideoCard[]; start?: number; followed?: string[] }) {
  const { current, showNotice } = useApp();
  const pathname = usePathname();
  const [shorts, setShorts] = useState(initial);
  const [index, setIndex] = useState(Math.max(0, Math.min(start, initial.length - 1)));
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const lastMove = useRef(0);
  const touchY = useRef<number | null>(null);
  const recorded = useRef(new Set<string>());
  const s = shorts[index];
  const key = s ? `${s.source}:${s.id}` : "";

  const move = useCallback(
    (by: number) => {
      const now = Date.now();
      if (now - lastMove.current < 450) return;
      lastMove.current = now;
      setIndex((i) => Math.max(0, Math.min(shorts.length - 1, i + by)));
    },
    [shorts.length],
  );

  // ↑/↓ keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        move(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  // The address shows the Short you're on, so it can be shared.
  useEffect(() => {
    if (s) window.history.replaceState(null, "", `/shorts?v=${s.source}:${encodeURIComponent(s.id)}`);
  }, [s]);

  // Counts as watched after 3 seconds (for recommendations).
  useEffect(() => {
    if (!current || !s || recorded.current.has(key)) return;
    const t = setTimeout(() => {
      recorded.current.add(key);
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: s.source, id: s.id, title: s.title, channelId: s.channelId || null, channelName: s.channelName }),
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [current, s, key]);

  if (!s) return null;
  const upcoming = shorts.slice(index + 1, index + 3);

  function needSignIn(): boolean {
    if (current) return false;
    window.location.assign(signInHref(pathname));
    return true;
  }

  async function like() {
    if (needSignIn()) return;
    const on = !liked.has(key);
    setLiked((set) => {
      const n = new Set(set);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
    await fetch("/api/video-likes", {
      method: on ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: s.source, id: s.id, channelId: s.channelId || null }),
    });
  }

  async function notInterested() {
    if (needSignIn()) return;
    await fetch("/api/hidden", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "video", ref: key }) });
    showNotice({ kind: "info", text: "Got it. You'll see fewer Shorts like that." });
    setShorts((list) => list.filter((_, i) => i !== index));
    setIndex((i) => Math.max(0, Math.min(i, shorts.length - 2)));
  }

  async function share() {
    const url = `${window.location.origin}/shorts?v=${key}`;
    try {
      if (navigator.share) await navigator.share({ title: s.title, url });
      else {
        await navigator.clipboard.writeText(url);
        showNotice({ kind: "info", text: "Link copied." });
      }
    } catch {}
  }

  return (
    <div
      className="flex h-[calc(100dvh-7.5rem)] items-center justify-center gap-4"
      onWheel={(e) => Math.abs(e.deltaY) > 25 && move(e.deltaY > 0 ? 1 : -1)}
      onTouchStart={(e) => {
        touchY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchY.current === null) return;
        const dy = touchY.current - e.changedTouches[0].clientY;
        touchY.current = null;
        if (Math.abs(dy) > 60) move(dy > 0 ? 1 : -1);
      }}
    >
      <div className="relative aspect-[9/16] h-full max-w-full overflow-hidden rounded-2xl bg-black shadow-2xl shadow-black/40">
        {/* One player per source, reused for every Short. */}
        <VideoPlayer key={s.source} source={s.source} id={s.id} src={s.src} poster={s.thumbnail} title={s.title} variant="short" active />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-7 pt-20 text-white">
          <div className="flex items-center gap-2 text-sm">
            <SourceBadge source={s.source} />
            <span className="truncate font-semibold">{s.channelName}</span>
          </div>
          <p key={key} className="mt-1.5 line-clamp-2 text-[15px] leading-snug">
            {s.title}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <RailButton label={liked.has(key) ? "Liked" : "Like"} onClick={like} active={liked.has(key)}>
          👍
        </RailButton>
        <RailButton label="Not for me" onClick={notInterested}>
          🚫
        </RailButton>
        <RailButton label="Share" onClick={share}>
          ↗
        </RailButton>
        {s.channelId && (
          <FollowButton
            key={`${s.source}:${s.channelId}`}
            target={{ kind: s.source === "youtube" ? "youtube" : "jace", ref: s.channelId, name: s.channelName }}
            initial={followed.includes(`${s.source}:${s.channelId.toLowerCase()}`)}
            size="sm"
            label="Subscribe"
          />
        )}
        <div className="mt-4 hidden flex-col gap-2 sm:flex">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={index === 0}
            aria-label="Previous Short"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[.08] text-lg hover:bg-foreground/[.14] disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={index >= shorts.length - 1}
            aria-label="Next Short"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[.08] text-lg hover:bg-foreground/[.14] disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>

      {/* Warm the next thumbnails so moving on looks instant. */}
      <div hidden>
        {upcoming.map((n) =>
          n.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${n.source}:${n.id}`} src={n.thumbnail} alt="" />
          ) : null,
        )}
      </div>
    </div>
  );
}
