import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;

/** Plain text with links made clickable. Never renders HTML from a post. */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
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
  );
}
