"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { signInHref, useApp } from "@/components/AppProvider";

/** Likes a video on Jace Media (it teaches your recommendations; nothing is sent to YouTube). */
export function VideoLikeButton({ source, id, channelId, initial }: { source: "youtube" | "jace"; id: string; channelId: string | null; initial: boolean }) {
  const { current } = useApp();
  const pathname = usePathname();
  const [liked, setLiked] = useState(initial);

  async function toggle() {
    if (!current) {
      window.location.assign(signInHref(pathname));
      return;
    }
    const next = !liked;
    setLiked(next);
    const res = await fetch("/api/video-likes", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, id, channelId }),
    });
    if (!res.ok) setLiked(!next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      title="Liking helps your recommendations"
      className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
        liked ? "bg-accent/15 text-accent" : "bg-foreground/[.07] hover:bg-foreground/[.12]"
      }`}
    >
      <span aria-hidden="true">{liked ? "👍" : "👍🏻"}</span> {liked ? "Liked" : "Like"}
    </button>
  );
}
