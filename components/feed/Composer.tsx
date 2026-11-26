"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { signInHref, useApp } from "@/components/AppProvider";
import { shrinkImage } from "@/lib/image";
import type { FeedItem } from "@/lib/types";
import { QuotedPost } from "./QuotedPost";

const MAX = 500;

/**
 * Write a Jace post, a reply (parentId), a quote (quote), or a comment on a
 * post from another network or a video (extTarget). Posts can have a picture or a poll.
 */
export function Composer({
  parentId,
  placeholder,
  extTarget,
  quote,
  onPosted,
}: {
  parentId?: string;
  placeholder?: string;
  extTarget?: { network: string; postId: string; endpoint?: string };
  quote?: FeedItem;
  onPosted?: () => void;
}) {
  const { current } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [days, setDays] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const simple = !!extTarget || !!parentId;

  if (!current) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 text-sm">
        <span className="text-muted">{simple ? "Sign in to comment." : "Sign in with Jace to post."}</span>
        <a href={signInHref(pathname)} className="rounded-full bg-accent px-4 py-1.5 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      </div>
    );
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      setImage(await shrinkImage(f));
      setPoll(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that picture.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const payload = extTarget
      ? { network: extTarget.network, postId: extTarget.postId, body }
      : {
          body,
          parentId,
          image,
          quote: quote ? { network: quote.network, id: quote.id } : undefined,
          poll: poll ? { options: poll.filter((o) => o.trim()), days } : undefined,
        };
    const res = await fetch(extTarget?.endpoint ?? (extTarget ? "/api/ext-comments" : "/api/posts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't post. Try again.");
      return;
    }
    setBody("");
    setImage(null);
    setPoll(null);
    onPosted?.();
    router.refresh();
  }

  const left = MAX - body.length;
  const canSend = !!body.trim() || !!image || !!quote;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex gap-3">
        <Avatar name={current.name} src={current.picture} size={simple ? 32 : 40} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX}
          rows={simple ? 2 : 3}
          placeholder={placeholder ?? "What's happening?"}
          aria-label={simple ? "Your comment" : "Your post"}
          className="min-h-10 flex-1 resize-y bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
      </div>
      {quote && (
        <div className="ml-[52px] mt-3">
          <QuotedPost item={quote} />
        </div>
      )}
      {image && (
        <div className="relative ml-[52px] mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="max-h-60 rounded-xl border border-line" />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label="Remove picture"
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
          >
            ✕
          </button>
        </div>
      )}
      {poll && (
        <div className="ml-[52px] mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
          {poll.map((o, i) => (
            <input
              key={i}
              value={o}
              onChange={(e) => setPoll((p) => p!.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={60}
              placeholder={`Choice ${i + 1}`}
              aria-label={`Poll choice ${i + 1}`}
              className="h-9 rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-accent"
            />
          ))}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {poll.length < 4 && (
              <button type="button" onClick={() => setPoll((p) => [...p!, ""])} className="rounded-full px-3 py-1 text-accent hover:bg-accent/10">
                + Add a choice
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-muted">
              Open for
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-background px-2 text-foreground">
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
              </select>
            </label>
            <button type="button" onClick={() => setPoll(null)} className="rounded-full px-3 py-1 text-muted hover:text-danger">
              Remove poll
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="ml-[52px] mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-1 pl-[52px]">
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {!extTarget && !quote && (
          <>
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-foreground/[.06] hover:text-foreground"
            >
              🖼 Picture
            </button>
            {!parentId && (
              <button
                type="button"
                onClick={() => {
                  setPoll((p) => (p ? null : ["", ""]));
                  setImage(null);
                }}
                className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-foreground/[.06] hover:text-foreground"
              >
                📊 Poll
              </button>
            )}
          </>
        )}
        <span className={`ml-auto text-xs ${left < 30 ? "text-warn" : "text-muted"}`}>{left}</span>
        <button
          type="submit"
          disabled={busy || !canSend}
          className="ml-2 rounded-full bg-accent px-5 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Posting…" : extTarget ? "Comment" : parentId ? "Reply" : quote ? "Quote" : "Post"}
        </button>
      </div>
    </form>
  );
}
