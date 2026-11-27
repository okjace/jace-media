"use client";

import { confirmDialog } from "@/components/ui/Dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/live/LiveHosts";
import { signInHref, useApp } from "@/components/AppProvider";
import { FollowButton } from "@/components/actions/FollowButton";
import { followTarget } from "@/lib/follow";
import { timeAgo } from "@/lib/format";
import { authorHref, placeHref, postHref } from "@/lib/links";
import { rate } from "@/lib/rate-client";
import { copyText, MenuAt, useContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { MarkdownToolbar } from "./MarkdownToolbar";
import type { FeedItem } from "@/lib/types";
import { NetworkBadge } from "./NetworkBadge";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { PollView } from "./PollView";
import { QuotedPost } from "./QuotedPost";
import { RepostButton } from "./RepostButton";
import { Markdown } from "./Markdown";
import { RichText } from "./RichText";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const SITE: Record<string, string> = { bluesky: "Bluesky", mastodon: "Mastodon", lemmy: "Lemmy", hackernews: "Hacker News", rss: "the site" };

/** Jace and Lemmy posts are written in Markdown; other networks' posts are plain text. */
function Body({ item, text }: { item: FeedItem; text: string }) {
  return item.network === "jace" || item.network === "lemmy" ? (
    <Markdown text={text} className="text-[15px] leading-relaxed" />
  ) : (
    <RichText text={text} className="text-[15px] leading-relaxed" />
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
  const [body, setBody] = useState(item.text);
  const [editedAt, setEditedAt] = useState(item.editedAt ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const editBox = useRef<HTMLTextAreaElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const isJace = item.network === "jace";
  const isComment = variant === "comment";
  const thread = postHref(item);
  const author = authorHref(item);
  const isArticle = item.network === "rss";
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
    if (!(await confirmDialog({ title: isComment ? "Delete this comment?" : "Delete this post?", message: isComment ? undefined : "This can't be undone.", confirm: "Delete", danger: true }))) return;
    const target = item.repostedBy ? item.repostedBy.repostId : item.id;
    const res = await fetch(isComment ? `/api/ext-comments?id=${target}` : `/api/posts/${target}`, { method: "DELETE" });
    if (res.ok) {
      setDeleted(true);
      router.refresh();
    } else showNotice({ kind: "error", text: "Couldn't delete that." });
  }

  const canEdit = !!item.canEdit && !item.repostedBy && (isJace || isComment);
  const editLimit = isComment ? 1000 : 3000;

  async function saveEdit() {
    const next = draft.trim();
    if (next === body.trim()) return setEditing(false);
    setSaving(true);
    const res = await fetch(isComment ? `/api/ext-comments?id=${encodeURIComponent(item.id)}` : `/api/posts/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: next }),
    });
    setSaving(false);
    if (res.ok) {
      setBody(next);
      setEditedAt(new Date().toISOString());
      setEditing(false);
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      showNotice({ kind: "error", text: data.error ?? "Couldn't save your edit." });
    }
  }

  async function hidePost(kind: "post" | "author") {
    const res = await fetch("/api/hidden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ref: kind === "post" ? `${item.network}:${item.id}` : `${item.network}:${item.author.handle}` }),
    });
    if (res.ok) {
      setDeleted(true);
      router.refresh();
      showNotice({ kind: "info", text: kind === "post" ? "Got it. You won't see this post again." : `You won't see posts from ${item.author.name} anymore.` });
    } else showNotice({ kind: "error", text: "Couldn't hide that." });
  }

  async function rateIt(rating: 1 | -1) {
    if (!(await rate(`${item.network}:${item.id}`, rating))) return;
    if (rating === -1) {
      setDeleted(true);
      router.refresh();
      showNotice({ kind: "info", text: "Thanks. It's hidden for you, and your rating helps hide it for others." });
    } else showNotice({ kind: "info", text: "Thanks for rating it appropriate." });
  }

  /** The post's menu: right-click it, press and hold it, or press ⋯. */
  const menuItems = (): MenuItem[] => {
    const list: MenuItem[] = [];
    const link = thread && !isComment ? `${window.location.origin}${thread}` : item.url;
    if (canEdit) list.push({ label: "Edit", icon: "✏️", onSelect: () => (setDraft(body), setEditing(true)) });
    if (item.canDelete) list.push({ label: item.repostedBy?.canDelete ? "Undo repost" : "Delete", icon: "🗑", danger: true, onSelect: remove });
    if (list.length) list.push("divider");
    if (thread && !isComment && !isArticle) list.push({ label: "Open in new tab", icon: "↗", href: thread, newTab: true });
    if (author) list.push({ label: `Go to ${item.author.name}`, icon: "👤", href: author });
    if (body) list.push({ label: "Copy text", icon: "📋", onSelect: async () => showNotice((await copyText(body)) ? { kind: "info", text: "Text copied." } : { kind: "error", text: "Couldn't copy." }) });
    if (link) {
      list.push({ label: "Copy link", icon: "🔗", onSelect: async () => showNotice((await copyText(link)) ? { kind: "info", text: "Link copied." } : { kind: "error", text: "Couldn't copy the link." }) });
      if ("share" in navigator) list.push({ label: "Share…", icon: "📤", onSelect: () => navigator.share({ title: item.title ?? item.author.name, url: link }).catch(() => {}) });
    }
    if (!isJace && item.url) list.push({ label: `Open on ${SITE[item.network] ?? "the site"}`, icon: "🌐", href: item.url, newTab: true });
    const mine = isJace && item.authorSub === current?.sub;
    if (current && !isComment && !mine) {
      list.push("divider");
      list.push({ label: "Not interested", icon: "🚫", onSelect: () => hidePost("post") });
      list.push({ label: `Hide posts from ${item.author.name}`, icon: "⊘", onSelect: () => hidePost("author") });
      list.push({ label: "Rate appropriate", icon: "👍", onSelect: () => rateIt(1) });
      list.push({ label: "Rate inappropriate", icon: "🚩", danger: true, onSelect: () => rateIt(-1) });
    }
    return list;
  };
  const context = useContextMenu(menuItems);

  if (deleted) return null;

  const images = item.media.slice(0, 4);
  const target = followTarget(item);
  const canFollow = !isComment && !!target && !(isJace && item.authorSub === current?.sub);
  const clickable = linkToThread && !isComment && !isArticle;
  const text = linkToThread && body.length > 900 ? `${body.slice(0, 900)}…` : body;

  return (
    <article {...(editing ? {} : context.props)} className={`rounded-2xl border border-line bg-panel transition-colors ${isComment ? "p-3" : "p-4 hover:border-foreground/20"}`}>
      {item.repostedBy && (
        <p className="mb-2 flex items-center gap-2 pl-[52px] text-xs font-medium text-muted">
          <span aria-hidden="true">↻</span>
          <Link href={item.repostedBy.url} className="hover:text-foreground hover:underline">
            {item.repostedBy.name}
          </Link>
          reposted
          {item.repostedBy.canDelete && (
            <button type="button" onClick={remove} className="ml-auto rounded-full px-2 py-0.5 hover:bg-danger/10 hover:text-danger">
              Undo
            </button>
          )}
        </p>
      )}
      <header className="flex items-start gap-3">
        <MaybeLink href={author}>
          <UserAvatar sub={isJace ? item.authorSub : null} name={item.author.name} src={item.author.picture} size={isComment ? 32 : 40} />
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
              <time dateTime={item.createdAt} suppressHydrationWarning>
                {timeAgo(item.createdAt)}
              </time>
            </MaybeLink>
            {editedAt && (
              <span title={`Edited ${new Date(editedAt).toLocaleString()}`} suppressHydrationWarning>
                · edited
              </span>
            )}
          </div>
        </div>
        {canFollow && <FollowButton target={target!} initial={followed} size="sm" />}
        <button
          ref={moreButton}
          type="button"
          onClick={() => {
            const r = moreButton.current!.getBoundingClientRect();
            setMenuAt(menuAt ? null : { x: r.right - 224, y: r.bottom + 4 });
          }}
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={!!menuAt}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-foreground/[.08] hover:text-foreground"
        >
          ⋯
        </button>
        {menuAt && <MenuAt x={menuAt.x} y={menuAt.y} items={menuItems()} onClose={() => setMenuAt(null)} />}
        {context.menu}
      </header>

      <div className={`space-y-2 ${isComment ? "mt-2 pl-11" : "mt-3"}`}>
        {item.title && (
          <MaybeLink href={clickable ? thread : null} className="block text-[17px] font-semibold leading-snug hover:underline">
            {item.title}
          </MaybeLink>
        )}
        {editing ? (
          <div className="flex flex-col gap-2" data-no-menu>
            {(isJace || item.network === "lemmy") && <MarkdownToolbar target={editBox} onChange={setDraft} />}
            <textarea
              ref={editBox}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveEdit();
              }}
              rows={Math.min(12, Math.max(3, draft.split("\n").length + 1))}
              maxLength={editLimit}
              autoFocus
              className="w-full rounded-xl border border-line bg-background px-3 py-2 text-[15px] outline-none focus:border-accent"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted">
                {draft.length}/{editLimit}
              </span>
              <span className="flex-1" />
              <button type="button" onClick={() => setEditing(false)} className="h-8 rounded-full border border-line px-4 text-sm hover:bg-foreground/[.05]">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="h-8 rounded-full bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : text &&
          (clickable ? (
            // Opens the post, except when a link inside the text was clicked.
            <div
              role="link"
              tabIndex={0}
              onClick={(e) => !(e.target as HTMLElement).closest("a") && router.push(thread)}
              onKeyDown={(e) => e.key === "Enter" && router.push(thread)}
              className="cursor-pointer"
            >
              <Body item={item} text={text} />
            </div>
          ) : (
            <Body item={item} text={text} />
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
        {item.video && (
          <div className="overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
            <VideoPlayer
              source={item.video.source}
              id={item.video.id}
              src={item.video.src ?? undefined}
              poster={item.video.thumbnail}
              title={item.video.title ?? "Video"}
              variant="embed"
              active={false}
            />
          </div>
        )}
        {item.poll && isJace && <PollView postId={item.id} poll={item.poll} />}
        {item.quote && <QuotedPost item={item.quote} />}
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
        (item.canDelete || canEdit) && !editing && (
          <div className="mt-1 flex justify-end">
            {canEdit && (
              <button type="button" onClick={() => (setDraft(body), setEditing(true))} className="rounded-full px-2 py-1 text-xs text-muted hover:bg-foreground/[.06] hover:text-foreground">
                Edit
              </button>
            )}
            {item.canDelete && <button type="button" onClick={remove} className="rounded-full px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger">
              Delete
            </button>}
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
          {!isArticle && <RepostButton item={item} count={isJace && counts && item.stats.reposts ? compact.format(item.stats.reposts) : undefined} />}
          {linkToThread && !isArticle && (
            <Link href={thread} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-foreground/[.06] hover:text-foreground">
              <span aria-hidden="true">💬</span>
              {counts && compact.format((item.stats.replies ?? 0) + (comments ?? 0))}
              <span className="sr-only">comments</span>
            </Link>
          )}
          <span className="flex-1" />
          {canEdit && !editing && (
            <button type="button" onClick={() => (setDraft(body), setEditing(true))} className="rounded-full px-2.5 py-1 text-xs hover:bg-foreground/[.06] hover:text-foreground">
              Edit
            </button>
          )}
          {item.canDelete && !item.repostedBy && (
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
