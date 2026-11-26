"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { signInHref, useApp } from "@/components/AppProvider";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Like and dislike in one counter, like YouTube's. The counts are the video's
 * own (YouTube's likes and Return YouTube Dislike's estimate, or Jace's likes),
 * with your vote added. Votes also teach your recommendations.
 */
export function VideoVotes({
  source,
  id,
  channelId,
  initial,
  likes,
  dislikes,
}: {
  source: "youtube" | "jace";
  id: string;
  channelId: string | null;
  /** Your vote when the page loaded. */
  initial: 1 | -1 | 0;
  /** Counts not including your vote (null when unknown). */
  likes: number | null;
  dislikes: number | null;
}) {
  const { current, extensions } = useApp();
  const pathname = usePathname();
  const [vote, setVote] = useState(initial);
  const showCounts = !extensions.hideCounts;

  async function cast(value: 1 | -1) {
    if (!current) {
      window.location.assign(signInHref(pathname));
      return;
    }
    const next = vote === value ? 0 : value;
    const before = vote;
    setVote(next);
    const res = await fetch("/api/video-likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, id, channelId, value: next }),
    });
    if (!res.ok) setVote(before);
  }

  const likeCount = likes === null ? null : likes + (vote === 1 ? 1 : 0);
  const dislikeCount = dislikes === null ? null : dislikes + (vote === -1 ? 1 : 0);
  const half = "flex h-9 items-center gap-2 px-3.5 text-sm font-medium transition-colors hover:bg-foreground/[.12]";

  return (
    <div className="flex items-center overflow-hidden rounded-full bg-foreground/[.07]" role="group" aria-label="Like or dislike">
      <button type="button" onClick={() => cast(1)} aria-pressed={vote === 1} aria-label="Like" className={`${half} ${vote === 1 ? "text-accent" : ""}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={vote === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7" />
        </svg>
        {showCounts && likeCount !== null ? compact.format(likeCount) : "Like"}
      </button>
      <span className="h-5 w-px bg-line" aria-hidden="true" />
      <button type="button" onClick={() => cast(-1)} aria-pressed={vote === -1} aria-label="Dislike" className={`${half} ${vote === -1 ? "text-danger" : ""}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill={vote === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 14V3h4v11zM17 14l-4 8a3 3 0 0 1-3-3v-4H4.5a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 5.9 3H17" />
        </svg>
        {showCounts && dislikeCount !== null ? compact.format(dislikeCount) : null}
      </button>
    </div>
  );
}
