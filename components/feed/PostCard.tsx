"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { signInHref, useApp } from "@/components/AppProvider";
import { FollowButton } from "@/components/actions/FollowButton";
import { followTarget } from "@/lib/follow";
import { timeAgo } from "@/lib/format";
import type { FeedItem } from "@/lib/types";
import { NetworkBadge } from "./NetworkBadge";
import { RichText } from "./RichText";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function Stat({ icon, n, label }: { icon: string; n?: number; label: string }) {
  if (n === undefined || n === null) return null;
  return (
    <span className="flex items-center gap-1" title={label}>
      <span aria-hidden="true">{icon}</span>
      <span>{compact.format(n)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function AuthorLink({ item, children }: { item: FeedItem; children: React.ReactNode }) {
  const href = item.author.url;
  if (!href) return <>{children}</>;
  if (item.network === "jace") return <Link href={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** One post from any network. Jace posts can be liked, replied to, and deleted here; others open on their own site. */
export function PostCard({ item, linkToThread = true, followed = false }: { item: FeedItem; linkToThread?: boolean; followed?: boolean }) {
  const { current, showNotice } = useApp();
  const router = useRouter();
  const [liked, setLiked] = useState(!!item.likedByMe);
  const [likes, setLikes] = useState(item.stats.likes ?? 0);
  const [deleted, setDeleted] = useState(false);
  const isJace = item.network === "jace";
  const external = !isJace;

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
    if (!confirm("Delete this post? This can't be undone.")) return;
    const res = await fetch(`/api/posts/${item.id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleted(true);
      router.refresh();
    } else showNotice({ kind: "error", text: "Couldn't delete that post." });
  }

  if (deleted) return null;

  const images = item.media.slice(0, 4);
  const target = followTarget(item);
  const canFollow = !!target && !(item.network === "jace" && item.authorSub === current?.sub);

  return (
    <article className="rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-foreground/20">
      <header className="flex items-start gap-3">
        <AuthorLink item={item}>
          <Avatar name={item.author.name} src={item.author.picture} size={40} />
        </AuthorLink>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <AuthorLink item={item}>
              <span className="font-semibold hover:underline">{item.author.name}</span>
            </AuthorLink>
            <span className="truncate text-sm text-muted">{isJace ? `@${item.author.handle}` : item.author.handle}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <NetworkBadge network={item.network} />
            {item.place && <span className="truncate">{item.place}</span>}
            <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
          </div>
        </div>
        {canFollow && <FollowButton target={target!} initial={followed} size="sm" />}
      </header>

      <div className="mt-3 space-y-2">
        {item.title &&
          (item.link ? (
            <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="block text-[17px] font-semibold leading-snug hover:underline">
              {item.title}
            </a>
          ) : (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="block text-[17px] font-semibold leading-snug hover:underline">
              {item.title}
            </a>
          ))}
        {item.text &&
          (isJace && linkToThread ? (
            <Link href={item.url} className="block">
              <RichText text={item.text} className="text-[15px] leading-relaxed" />
            </Link>
          ) : (
            <RichText text={item.text.length > 700 ? `${item.text.slice(0, 700)}…` : item.text} className="text-[15px] leading-relaxed" />
          ))}
        {images.length > 0 && (
          <div className={`grid gap-1.5 overflow-hidden rounded-xl ${images.length > 1 ? "grid-cols-2" : ""}`}>
            {images.map((m, i) => (
              <a
                key={i}
                href={m.kind === "video" ? item.url : m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block overflow-hidden rounded-xl border border-line bg-black/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.thumb ?? m.url}
                  alt={m.alt ?? ""}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={`w-full object-cover ${images.length > 1 ? "aspect-square" : "max-h-[520px]"}`}
                />
                {m.kind === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-xl text-white">▶</span>
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
        {item.link && !item.title && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block truncate rounded-xl border border-line px-3 py-2 text-sm text-muted hover:text-foreground"
          >
            🔗 {item.link.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        )}
      </div>

      <footer className="mt-3 flex items-center gap-5 text-sm text-muted">
        {isJace ? (
          <>
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={liked}
              className={`flex items-center gap-1 rounded-full px-2 py-1 -ml-2 transition-colors hover:bg-accent/10 ${liked ? "text-accent" : ""}`}
            >
              <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
              {compact.format(likes)}
              <span className="sr-only">{liked ? "Unlike" : "Like"}</span>
            </button>
            {linkToThread && (
              <Link href={item.url} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-foreground/[.06]">
                <span aria-hidden="true">💬</span> {compact.format(item.stats.replies ?? 0)}
                <span className="sr-only">replies</span>
              </Link>
            )}
            {item.canDelete && (
              <button type="button" onClick={remove} className="ml-auto rounded-full px-2 py-1 text-xs hover:bg-danger/10 hover:text-danger">
                Delete
              </button>
            )}
          </>
        ) : (
          <>
            <Stat icon="♡" n={item.stats.likes} label="likes" />
            <Stat icon="▲" n={item.stats.score} label="points" />
            <Stat icon="💬" n={item.stats.replies} label="replies" />
            <Stat icon="↻" n={item.stats.reposts} label="reposts" />
            {external && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-auto rounded-full px-2 py-1 text-xs hover:bg-foreground/[.06] hover:text-foreground">
                Open on {item.network === "hackernews" ? "HN" : item.network[0].toUpperCase() + item.network.slice(1)} ↗
              </a>
            )}
          </>
        )}
      </footer>
    </article>
  );
}
