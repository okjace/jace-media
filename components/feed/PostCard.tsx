"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { signInHref, useApp } from "@/components/AppProvider";
import { FollowButton } from "@/components/actions/FollowButton";
import { followTarget } from "@/lib/follow";
import { timeAgo } from "@/lib/format";
import { authorHref, placeHref, postHref } from "@/lib/links";
import { rate } from "@/lib/rate-client";
import type { FeedItem } from "@/lib/types";
import { NetworkBadge } from "./NetworkBadge";
import { RichText } from "./RichText";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const SITE: Record<string, string> = { bluesky: "Bluesky", mastodon: "Mastodon", lemmy: "Lemmy", hackernews: "Hacker News" };

/** The ⋯ menu on a post: rate it appropriate or inappropriate. */
function PostMenu({ target, onHide }: { target: string; onHide: () => void }) {
  const { current, showNotice } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!current) return null;
  async function rateIt(rating: 1 | -1) {
    setOpen(false);
    if (!(await rate(target, rating))) return;
    if (rating === -1) {
      onHide();
      showNotice({ kind: "info", text: "Thanks. It's hidden for you, and your rating helps hide it for others." });
    } else showNotice({ kind: "info", text: "Thanks for rating it appropriate." });
  }
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-foreground/[.08] hover:text-foreground"
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-xl shadow-black/30">
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

function MaybeLink({ href, children, className }: { href: string | null; children: ReactNode; className?: string }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

/**
 * One post from any network. Everything opens inside Jace Media: the author's
 * profile, the community, and the post with its replies and comments.
 * variant "comment" is a Jace Media comment on another network's post.
 */
export function PostCard({
  item,
  linkToThread = true,
  followed = false,
  variant = "post",
  comments,
}: {
  item: FeedItem;
  linkToThread?: boolean;
  followed?: boolean;
  variant?: "post" | "comment";
  /** Jace Media comments on this post (other networks). */
  comments?: number;
}) {
  const { current, showNotice, extensions } = useApp();
  const router = useRouter();
  const [liked, setLiked] = useState(!!item.likedByMe);
  const [likes, setLikes] = useState(item.stats.likes ?? 0);
  const [deleted, setDeleted] = useState(false);
  const isJace = item.network === "jace";
  const isComment = variant === "comment";
  const thread = postHref(item);
  const author = authorHref(item);
  const counts = !extensions.hideCounts;

  async function toggleLike() {
    if (!current) {
      window.location.assign(signInHref(window.location.pathname));
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const res = await fetch(`/api/posts/${item.id}/like`, { method: next ? "POST" : "DELETE" });
    if (res.ok) {
      const data = (await res.json()) as { likes: number; liked: boolean };
      setLikes(data.likes);
      setLiked(data.liked);
    } else {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }

  async function remove() {
    if (!confirm(isComment ? "Delete this comment?" : "Delete this post? This can't be undone.")) return;
    const res = await fetch(isComment ? `/api/ext-comments?id=${item.id}` : `/api/posts/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleted(true);
      router.refresh();
    } else showNotice({ kind: "error", text: "Couldn't delete that." });
  }

  if (deleted) return null;

  const images = item.media.slice(0, 4);
  const target = followTarget(item);
  const canFollow = !isComment && !!target && !(isJace && item.authorSub === current?.sub);
  const clickable = linkToThread && !isComment;
  const text = linkToThread && item.text.length > 600 ? `${item.text.slice(0, 600)}…` : item.text;

  return (
    <article className={`rounded-2xl border border-line bg-panel transition-colors ${isComment ? "p-3" : "p-4 hover:border-foreground/20"}`}>
      <header className="flex items-start gap-3">
        <MaybeLink href={author}>
          <Avatar name={item.author.name} src={item.author.picture} size={isComment ? 32 : 40} />
        </MaybeLink>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <MaybeLink href={author} className="font-semibold hover:underline">
              {item.author.name}
            </MaybeLink>
            <span className="truncate text-sm text-muted">{isJace ? `@${item.author.handle}` : item.author.handle}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {!isComment && <NetworkBadge network={item.network} />}
            {item.place && (
              <MaybeLink href={placeHref(item)} className="truncate hover:text-foreground">
                {item.place}
              </MaybeLink>
            )}
            <MaybeLink href={clickable ? thread : null} className="hover:text-foreground">
              <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
            </MaybeLink>
          </div>
        </div>
        {canFollow && <FollowButton target={target!} initial={followed} size="sm" />}
        {!isComment && <PostMenu target={`${item.network}:${item.id}`} onHide={() => setDeleted(true)} />}
      </header>

      <div className={`space-y-2 ${isComment ? "mt-2 pl-11" : "mt-3"}`}>
        {item.title && (
          <MaybeLink href={clickable ? thread : null} className="block text-[17px] font-semibold leading-snug hover:underline">
            {item.title}
          </MaybeLink>
        )}
        {text &&
          (clickable ? (
            // Opens the post, except when a link inside the text was clicked.
            <div
              role="link"
              tabIndex={0}
              onClick={(e) => !(e.target as HTMLElement).closest("a") && router.push(thread)}
              onKeyDown={(e) => e.key === "Enter" && router.push(thread)}
              className="cursor-pointer"
            >
              <RichText text={text} className="text-[15px] leading-relaxed" />
            </div>
          ) : (
            <RichText text={text} className="text-[15px] leading-relaxed" />
          ))}
        {images.length > 0 && (
          <div className={`grid gap-1.5 overflow-hidden rounded-xl ${images.length > 1 ? "grid-cols-2" : ""}`}>
            {images.map((m, i) => {
              const img = (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.thumb ?? m.url}
                    alt={m.alt ?? ""}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className={`w-full object-cover ${images.length > 1 ? "aspect-square" : "max-h-[560px]"}`}
                  />
                  {m.kind === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-xl text-white">▶</span>
                    </span>
                  )}
                </>
              );
              const cls = "relative block overflow-hidden rounded-xl border border-line bg-black/20";
              return clickable ? (
                <Link key={i} href={thread} className={cls}>
                  {img}
                </Link>
              ) : (
                <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className={cls}>
                  {img}
                </a>
              );
            })}
          </div>
        )}
        {item.link && (
          // Shared articles are the one thing that opens elsewhere.
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex items-center gap-2 truncate rounded-xl border border-line px-3 py-2 text-sm text-muted transition-colors hover:bg-foreground/[.04] hover:text-foreground"
          >
            <span aria-hidden="true">🔗</span>
            <span className="truncate">{item.link.replace(/^https?:\/\/(www\.)?/, "")}</span>
          </a>
        )}
      </div>

      {isComment ? (
        item.canDelete && (
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={remove} className="rounded-full px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger">
              Delete
            </button>
          </div>
        )
      ) : (
        <footer className="-ml-2 mt-3 flex items-center gap-1 text-sm text-muted">
          {isJace ? (
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={liked}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors hover:bg-accent/10 ${liked ? "text-accent" : ""}`}
            >
              <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
              {counts && compact.format(likes)}
              <span className="sr-only">{liked ? "Unlike" : "Like"}</span>
            </button>
          ) : (
            counts && (
              <span className="flex items-center gap-3 px-2.5">
                {item.stats.likes !== undefined && <span title="likes">♡ {compact.format(item.stats.likes)}</span>}
                {item.stats.score !== undefined && <span title="points">▲ {compact.format(item.stats.score)}</span>}
                {item.stats.reposts !== undefined && <span title="reposts">↻ {compact.format(item.stats.reposts)}</span>}
              </span>
            )
          )}
          {linkToThread && (
            <Link href={thread} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-foreground/[.06] hover:text-foreground">
              <span aria-hidden="true">💬</span>
              {counts && compact.format((item.stats.replies ?? 0) + (comments ?? 0))}
              <span className="sr-only">comments</span>
            </Link>
          )}
          <span className="flex-1" />
          {item.canDelete && (
            <button type="button" onClick={remove} className="rounded-full px-2.5 py-1 text-xs hover:bg-danger/10 hover:text-danger">
              Delete
            </button>
          )}
          {!isJace && !linkToThread && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="rounded-full px-2.5 py-1 text-xs hover:bg-foreground/[.06] hover:text-foreground">
              Open on {SITE[item.network]} ↗
            </a>
          )}
        </footer>
      )}
    </article>
  );
}
