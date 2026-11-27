"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Composer } from "@/components/feed/Composer";
import { PostCard } from "@/components/feed/PostCard";
import { RichText } from "@/components/feed/RichText";
import { timeAgo } from "@/lib/format";
import type { FeedItem } from "@/lib/types";

type Other = { id: string; name: string; picture: string | null; text: string; when: string; likes: number; pinned: boolean };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** A Short's comments in a panel: beside the Short on big screens, a sheet from the bottom on phones. */
export function ShortComments({ source, id, title, onClose }: { source: "youtube" | "jace"; id: string; title: string; onClose: () => void }) {
  const [data, setData] = useState<{ mine: FeedItem[]; others: Other[] } | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/comments?source=${source}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => setError(true));
  }, [source, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(false);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const count = data ? data.mine.length + data.others.length : null;

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[75dvh] flex-col rounded-t-3xl border border-line bg-panel shadow-2xl shadow-black/50 md:static md:z-auto md:h-full md:max-h-none md:w-[380px] md:shrink-0 md:rounded-2xl"
      aria-label="Comments"
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">Comments{count !== null ? ` · ${count}` : ""}</p>
          <p className="truncate text-xs text-muted">{title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close comments" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[.08]">
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Composer
          extTarget={source === "jace" ? { network: "jace", postId: id, endpoint: "/api/jace-comments" } : { network: "youtube", postId: id }}
          placeholder="Add a comment"
          onPosted={load}
        />
        {error && <p className="py-6 text-center text-sm text-muted">Couldn&apos;t load comments.</p>}
        {!data && !error && <p className="py-6 text-center text-sm text-muted">Loading comments…</p>}
        {data && (
          <div className="mt-4 flex flex-col gap-4">
            {data.mine.map((c) => (
              <PostCard key={c.id} item={c} variant="comment" />
            ))}
            {data.others.length > 0 && source === "youtube" && <p className="text-xs font-semibold uppercase tracking-wide text-muted">On YouTube</p>}
            {data.others.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar name={c.name} src={c.picture} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{c.name}</span> <span className="text-muted">· {timeAgo(c.when)}</span>
                    {c.pinned && <span className="ml-2 text-xs text-accent">📌 Pinned</span>}
                  </p>
                  <RichText text={c.text} className="mt-0.5 text-sm leading-relaxed" />
                  {c.likes > 0 && <p className="mt-1 text-xs text-muted">♡ {compact.format(c.likes)}</p>}
                </div>
              </div>
            ))}
            {count === 0 && <p className="py-4 text-center text-sm text-muted">No comments yet. Be the first!</p>}
          </div>
        )}
      </div>
    </aside>
  );
}
