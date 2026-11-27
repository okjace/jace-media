import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;

/**
 * Pictures someone attached to a comment: files on Jace's storage (the only
 * pictures shown inline, so a comment can't load images from other websites).
 */
export function isAttachedPicture(url: string): boolean {
  try {
    const u = new URL(url);
    const jaceStorage = u.protocol === "https:" && /\.supabase\.co$/.test(u.hostname);
    const localTest = u.hostname === "localhost";
    return (jaceStorage || localTest) && /\/thumbnails\/[\w-]+\/[^?#]+\.(webp|jpe?g|png|gif)$/i.test(u.pathname) && !u.search;
  } catch {
    return false;
  }
}

/** Plain text with links made clickable and attached pictures shown. Never renders HTML from a post. */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const pictures = (text.match(URL_RE) ?? []).filter(isAttachedPicture).slice(0, 4);
  const words = pictures.length ? pictures.reduce((t, p) => t.replace(p, ""), text).replace(/\n{3,}/g, "\n\n").trim() : text;
  const parts = words.split(URL_RE);
  return (
    <>
      {words && (
        <p className={`whitespace-pre-wrap break-words ${className}`}>
          {parts.map((part, i) =>
            i % 2 === 1 ? (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-accent hover:underline">
                {part.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
                {part.replace(/^https?:\/\/(www\.)?/, "").length > 60 ? "…" : ""}
              </a>
            ) : (
              <Fragment key={i}>{part}</Fragment>
            ),
          )}
        </p>
      )}
      {pictures.length > 0 && (
        <div className={`mt-2 grid max-w-md gap-1.5 ${pictures.length > 1 ? "grid-cols-2" : ""}`}>
          {pictures.map((src) => (
            <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line">
              {/* A picture on Jace's storage. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Attached picture" loading="lazy" className={`w-full object-cover ${pictures.length > 1 ? "aspect-square" : "max-h-80"}`} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
