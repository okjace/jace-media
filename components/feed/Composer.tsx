"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { signInHref, useApp } from "@/components/AppProvider";
import { shrinkImage } from "@/lib/image";

const MAX = 500;

/** Write a Jace post (or a reply, with parentId). */
export function Composer({ parentId, placeholder }: { parentId?: string; placeholder?: string }) {
  const { current } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  if (!current) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 text-sm">
        <span className="text-muted">{parentId ? "Sign in to reply." : "Sign in with Jace to post."}</span>
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that picture.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId, image }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't post. Try again.");
      return;
    }
    setBody("");
    setImage(null);
    router.refresh();
  }

  const left = MAX - body.length;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex gap-3">
        <Avatar name={current.name} src={current.picture} size={40} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX}
          rows={parentId ? 2 : 3}
          placeholder={placeholder ?? "What's happening?"}
          aria-label={parentId ? "Your reply" : "Your post"}
          className="min-h-12 flex-1 resize-y bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
      </div>
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
      {error && <p role="alert" className="ml-[52px] mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2 pl-[52px]">
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-foreground/[.06] hover:text-foreground"
        >
          🖼 Picture
        </button>
        <span className={`ml-auto text-xs ${left < 30 ? "text-warn" : "text-muted"}`}>{left}</span>
        <button
          type="submit"
          disabled={busy || (!body.trim() && !image)}
          className="rounded-full bg-accent px-5 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Posting…" : parentId ? "Reply" : "Post"}
        </button>
      </div>
    </form>
  );
}
