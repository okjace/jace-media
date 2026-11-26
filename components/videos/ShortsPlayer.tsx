"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { SourceBadge } from "./VideoGrid";
import type { VideoCard } from "@/lib/types";

/**
 * Shorts, one per screen: scroll, swipe, or use the arrow keys. Only the Short
 * on screen loads its player. YouTube Shorts play in YouTube's
 * privacy-enhanced player; Jace Shorts play straight from Jace.
 */
export function ShortsPlayer({ shorts, start = 0 }: { shorts: VideoCard[]; start?: number }) {
  const { current } = useApp();
  const [active, setActive] = useState(start);
  const box = useRef<HTMLDivElement>(null);
  const recorded = useRef(new Set<string>());

  // Which Short is on screen.
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    // Scroll only the Shorts box, never the page around it.
    const first = root.querySelector<HTMLElement>(`[data-index="${start}"]`);
    if (first) root.scrollTop = first.offsetTop;
    return () => io.disconnect();
  }, [start, shorts.length]);

  // Arrow keys move between Shorts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const next = Math.max(0, Math.min(shorts.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      const el = box.current?.querySelector<HTMLElement>(`[data-index="${next}"]`);
      if (el) box.current!.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, shorts.length]);

  // Counts as watched after 3 seconds on screen (for recommendations).
  useEffect(() => {
    const s = shorts[active];
    if (!current || !s || recorded.current.has(`${s.source}:${s.id}`)) return;
    const t = setTimeout(() => {
      recorded.current.add(`${s.source}:${s.id}`);
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: s.source, id: s.id, title: s.title, channelId: s.channelId, channelName: s.channelName }),
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [active, current, shorts]);

  return (
    <div
      ref={box}
      className="no-scrollbar relative mx-auto h-[calc(100dvh-8.5rem)] w-full max-w-[420px] snap-y snap-mandatory overflow-y-scroll rounded-2xl"
    >
      {shorts.map((s, i) => {
        const near = Math.abs(i - active) <= 1;
        return (
          <section key={`${s.source}:${s.id}`} data-index={i} className="relative flex h-full snap-start snap-always items-center justify-center bg-black">
            {near ? (
              <VideoPlayer source={s.source} id={s.id} src={s.src} poster={s.thumbnail} title={s.title} variant="short" active={i === active} />
            ) : (
              s.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumbnail} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-60" />
              )
            )}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-1 bg-gradient-to-t from-black/85 to-transparent p-4 pt-16 text-white"
            >
              <div className="flex items-center gap-2 text-sm">
                <SourceBadge source={s.source} />
                <span className="truncate font-medium">{s.channelName}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[15px] font-medium">{s.title}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
