"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { signInHref, useApp } from "@/components/AppProvider";
import { shrinkImage, shrinkToBlob } from "@/lib/image";
import { captureThumbnail, publishVideo, uploadPicture } from "@/lib/uploadClient";
import type { FeedItem } from "@/lib/types";
import { Markdown } from "./Markdown";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { QuotedPost } from "./QuotedPost";

const MAX = 3000;
const MAX_COMMENT = 1000;

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
  // A picture: shown from the device right away; uploaded to Jace's storage (url), or kept as data if that fails.
  const [image, setImage] = useState<{ preview: string; url?: string; data?: string; uploading?: boolean } | null>(null);
  // A video, uploaded to Jace as an unlisted video that only this post shows.
  const [video, setVideo] = useState<{ id?: string; name: string; thumb: string | null; progress: number } | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [days, setDays] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
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
      const blob = await shrinkToBlob(f);
      const preview = URL.createObjectURL(blob);
      setImage({ preview, uploading: true });
      setPoll(null);
      try {
        const url = await uploadPicture(blob);
        setImage({ preview, url });
      } catch {
        // Jace's storage didn't take it: keep a small copy in Jace Media instead.
        setImage({ preview, data: await shrinkImage(f) });
      }
    } catch (err) {
      setImage(null);
      setError(err instanceof Error ? err.message : "Couldn't read that picture.");
    }
  }

  async function pickVideo(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("That isn't a video file.");
      return;
    }
    setError(null);
    setPoll(null);
    const thumbBlob = await captureThumbnail(f);
    const thumb = thumbBlob ? URL.createObjectURL(thumbBlob) : null;
    setVideo({ name: f.name, thumb, progress: 0 });
    try {
      const title = (body.split("\n")[0].replace(/[#*_~`>|]/g, "").trim() || f.name.replace(/\.[^.]+$/, "")).slice(0, 140);
      const { video: uploaded } = await publishVideo(
        { file: f, thumbnail: thumbBlob, title, description: "Posted on Jace Media", visibility: "unlisted" },
        (p) => setVideo((v) => (v ? { ...v, progress: p } : v)),
      );
      setVideo((v) => (v ? { ...v, id: uploaded.id, progress: 1 } : v));
    } catch (err) {
      setVideo(null);
      setError(err instanceof Error ? err.message : "Couldn't upload that video.");
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
          image: image?.data,
          imageUrl: image?.url,
          video: video?.id ? { source: "jace", id: video.id } : undefined,
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
    setVideo(null);
    setPoll(null);
    onPosted?.();
    router.refresh();
  }

  const left = (extTarget ? MAX_COMMENT : MAX) - body.length;
  const mediaBusy = !!image?.uploading || (!!video && !video.id);
  const canSend = (!!body.trim() || !!image || !!quote || !!video?.id) && !mediaBusy;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex gap-3">
        <Avatar name={current.name} src={current.picture} size={simple ? 32 : 40} />
        {preview ? (
          <div className="min-h-16 flex-1 text-[15px] leading-relaxed">
            {body.trim() ? <Markdown text={body} /> : <span className="text-muted">Nothing to preview yet.</span>}
          </div>
        ) : (
          <textarea
            ref={textRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={extTarget ? MAX_COMMENT : MAX}
            rows={simple ? 2 : 3}
            placeholder={placeholder ?? "What's happening?"}
            aria-label={simple ? "Your comment" : "Your post"}
            className="min-h-10 flex-1 resize-y bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
        )}
      </div>
      <div className="mt-2 flex items-center gap-1 pl-[44px]">
        <MarkdownToolbar target={textRef} onChange={(v) => setBody(v.slice(0, extTarget ? MAX_COMMENT : MAX))} />
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-medium ${preview ? "bg-accent/15 text-accent" : "text-muted hover:bg-foreground/[.07] hover:text-foreground"}`}
        >
          {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {quote && (
        <div className="ml-[52px] mt-3">
          <QuotedPost item={quote} />
        </div>
      )}
      {image && (
        <div className="relative ml-[52px] mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.preview} alt="" className={`max-h-60 rounded-xl border border-line ${image.uploading ? "opacity-60" : ""}`} />
          {image.uploading && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">Uploading…</span>}
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
      {video && (
        <div className="ml-[52px] mt-3 flex items-center gap-3 rounded-xl border border-line p-2">
          <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-black/40">
            {video.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.thumb} alt="" className="h-full w-full object-cover" />
            )}
            <span className="absolute inset-0 flex items-center justify-center text-xl text-white">▶</span>
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{video.name}</p>
            {video.id ? (
              <p className="text-xs text-accent">Ready</p>
            ) : (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(video.progress * 100)}%` }} />
              </div>
            )}
          </div>
          <button type="button" onClick={() => setVideo(null)} aria-label="Remove video" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-foreground/[.08]">
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
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-8 rounded-lg border border-line bg-background px-2 text-foreground"
              >
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
              <>
                <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={(e) => pickVideo(e.target.files?.[0])} />
                <button
                  type="button"
                  disabled={!!video}
                  onClick={() => videoInput.current?.click()}
                  className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-foreground/[.06] hover:text-foreground disabled:opacity-50"
                >
                  🎬 Video
                </button>
              </>
            )}
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
          {mediaBusy ? "Uploading…" : busy ? "Posting…" : extTarget ? "Comment" : parentId ? "Reply" : quote ? "Quote" : "Post"}
        </button>
      </div>
    </form>
  );
}
