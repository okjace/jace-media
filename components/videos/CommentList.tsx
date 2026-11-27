"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { signInHref, useApp } from "@/components/AppProvider";
import { Avatar } from "@/components/Avatar";
import { Composer } from "@/components/feed/Composer";
import { PostCard } from "@/components/feed/PostCard";
import { RichText } from "@/components/feed/RichText";
import { timeAgo } from "@/lib/format";
import type { FeedItem } from "@/lib/types";

export type CommentData = {
  id: string;
  key: string;
  name: string;
  picture: string | null;
  text: string;
  when: string;
  likes: number;
  liked: boolean;
  pinned: boolean;
  replies: number;
};
type Mine = FeedItem & { key: string; likes: number; liked: boolean; replies: number };
type Loaded = { mine: Mine[]; others: CommentData[]; youtube?: boolean };

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function HeartIcon({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 8-4.3L12 8l1-1.3A4.6 4.6 0 0 1 21 11c-2 4.6-9 9-9 9z" />
    </svg>
  );
}

/** Like, Reply and the replies under any comment (YouTube's, Jace's or Jace Media's own). */
function CommentActions({ commentKey, ytId, likes, liked, replies, small }: { commentKey: string; ytId?: string; likes: number; liked: boolean; replies: number; small?: boolean }) {
  const { current, showNotice } = useApp();
  const pathname = usePathname();
  const [like, setLike] = useState({ on: liked, n: likes });
  const [replying, setReplying] = useState(false);
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<{ replies: CommentData[]; mine: Mine[] } | null>(null);
  const [count, setCount] = useState(replies);

  const loadThread = useCallback(() => {
    const qs = new URLSearchParams({ key: commentKey });
    if (ytId) qs.set("replies", ytId);
    fetch(`/api/comments?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setThread(d);
        setCount(Math.max(replies, d.replies.length + d.mine.length));
      })
      .catch(() => setThread({ replies: [], mine: [] }));
  }, [commentKey, ytId, replies]);

  async function toggleLike() {
    if (!current) {
      window.location.assign(signInHref(pathname));
      return;
    }
    const next = { on: !like.on, n: like.n + (like.on ? -1 : 1) };
    setLike(next);
    const res = await fetch("/api/comment-likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: commentKey, like: next.on }),
    }).catch(() => null);
    if (!res?.ok) {
      setLike(like);
      showNotice({ kind: "error", text: "Couldn't like that. Try again." });
    }
  }

  const pill = "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-foreground/[.08] hover:text-foreground";
  return (
    <div className="mt-1">
      <div className="-ml-2.5 flex flex-wrap items-center gap-1">
        <button type="button" onClick={toggleLike} aria-pressed={like.on} aria-label={like.on ? "Unlike" : "Like"} className={`${pill} ${like.on ? "!text-danger" : ""}`}>
          <HeartIcon on={like.on} />
          {like.n > 0 && compact.format(like.n)}
        </button>
        <button type="button" onClick={() => setReplying((r) => !r)} className={pill}>
          Reply
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={() => {
              if (!open && !thread) loadThread();
              setOpen((o) => !o);
            }}
            className={`${pill} !text-accent`}
          >
            {open ? "▴ Hide replies" : `▾ ${count} repl${count === 1 ? "y" : "ies"}`}
          </button>
        )}
      </div>
      {replying && (
        <div className="mt-2">
          <Composer
            extTarget={{ network: "comment", postId: commentKey }}
            placeholder="Add a reply"
            onPosted={() => {
              setReplying(false);
              setOpen(true);
              setCount((c) => c + 1);
              loadThread();
            }}
          />
        </div>
      )}
      {open && (
        <div className={`mt-3 flex flex-col gap-4 border-l-2 border-line ${small ? "pl-3" : "pl-4"}`}>
          {!thread && <p className="text-xs text-muted">Loading replies…</p>}
          {thread?.mine.map((c) => (
            <div key={c.id}>
              <PostCard item={c} variant="comment" />
              <CommentActions commentKey={c.key} likes={c.likes} liked={c.liked} replies={c.replies} small />
            </div>
          ))}
          {thread?.replies.map((c) => <CommentRow key={c.key} c={c} small />)}
          {thread && thread.mine.length + thread.replies.length === 0 && <p className="text-xs text-muted">No replies to show.</p>}
        </div>
      )}
    </div>
  );
}

export function CommentRow({ c, small }: { c: CommentData; small?: boolean }) {
  return (
    <div className="flex gap-3">
      <Avatar name={c.name} src={c.picture} size={small ? 28 : 36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{c.name}</span> <span className="text-muted">· {timeAgo(c.when)}</span>
          {c.pinned && <span className="ml-2 text-xs text-accent">📌 Pinned</span>}
        </p>
        <RichText text={c.text} className={`mt-0.5 leading-relaxed ${small ? "text-sm" : "text-[15px]"}`} />
        <CommentActions commentKey={c.key} ytId={c.key.startsWith("yt:") ? c.id : undefined} likes={c.likes} liked={c.liked} replies={c.replies} small={small} />
      </div>
    </div>
  );
}

/** A video's comments: write one, like any, reply to any, and open replies. */
export function CommentList({ source, id, small = false, onCount }: { source: "youtube" | "jace"; id: string; small?: boolean; onCount?: (n: number) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/comments?source=${source}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Loaded) => {
        setData(d);
        onCount?.(d.mine.length + d.others.length);
      })
      .catch(() => setError(true));
  }, [source, id, onCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError(false);
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <Composer
        extTarget={source === "jace" ? { network: "jace", postId: id, endpoint: "/api/jace-comments" } : { network: "youtube", postId: id }}
        placeholder={source === "jace" ? "Add a comment" : "Add a comment on Jace Media"}
        onPosted={load}
      />
      {error && <p className="py-4 text-center text-sm text-muted">Couldn&apos;t load comments.</p>}
      {!data && !error && <p className="py-4 text-center text-sm text-muted">Loading comments…</p>}
      {data && (
        <div className={`flex flex-col ${small ? "gap-4" : "gap-5"}`}>
          {data.mine.map((c) => (
            <div key={c.id}>
              <PostCard item={c} variant="comment" />
              <div className="pl-2">
                <CommentActions commentKey={c.key} likes={c.likes} liked={c.liked} replies={c.replies} small={small} />
              </div>
            </div>
          ))}
          {data.others.length > 0 && source === "youtube" && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">On YouTube</p>}
          {data.others.map((c) => (
            <CommentRow key={c.key} c={c} small={small} />
          ))}
          {data.mine.length + data.others.length === 0 && <p className="py-4 text-center text-sm text-muted">No comments yet. Be the first!</p>}
        </div>
      )}
    </div>
  );
}
