"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";

/**
 * A small, safe Markdown renderer for posts and comments. It builds React
 * elements (never HTML from the post), so nothing a post says can run code.
 *
 * Blocks: paragraphs, # headings, > quotes, - and 1. lists, ``` code blocks, ---.
 * Inline: **bold**, *italic*, ~~strike~~, `code`, [links](https://…), plain
 * links, ||spoilers||, @mentions, and #hashtags.
 */

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setShown(true);
      }}
      onKeyDown={(e) => e.key === "Enter" && setShown(true)}
      title={shown ? undefined : "Spoiler: tap to show"}
      className={`rounded px-0.5 transition-colors ${shown ? "bg-foreground/[.08]" : "cursor-pointer select-none bg-foreground text-transparent"}`}
    >
      {children}
    </span>
  );
}

const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : null);

// Order matters: code first (nothing inside code is formatted), then links, then the rest.
const INLINE =
  /(`[^`\n]+`)|(\[[^\]\n]{1,200}\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])|(\|\|[^|\n]+\|\|)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*|_[^_\n]+_)|(@[A-Za-z0-9_.-]{2,40})|(#[\p{L}\p{N}_]{2,50})/gu;

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    // @ and # only count at the start of a word.
    if ((m[9] || m[10]) && at > 0 && /[\p{L}\p{N}_]/u.test(text[at - 1])) continue;
    if (at > last) out.push(<Fragment key={`${key}${n++}`}>{text.slice(last, at)}</Fragment>);
    const k = `${key}${n++}`;
    const s = m[0];
    if (m[1]) out.push(<code key={k} className="rounded bg-foreground/[.08] px-1 py-0.5 font-mono text-[0.9em]">{s.slice(1, -1)}</code>);
    else if (m[2]) {
      const label = s.slice(1, s.indexOf("]("));
      const url = safeUrl(m[3]);
      out.push(
        url ? (
          <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">
            {inline(label, k)}
          </a>
        ) : (
          <Fragment key={k}>{label}</Fragment>
        ),
      );
    } else if (m[4]) {
      const shown = s.replace(/^https?:\/\/(www\.)?/, "");
      out.push(
        <a key={k} href={s} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">
          {shown.length > 60 ? `${shown.slice(0, 60)}…` : shown}
        </a>,
      );
    } else if (m[5]) out.push(<Spoiler key={k}>{inline(s.slice(2, -2), k)}</Spoiler>);
    else if (m[6]) out.push(<strong key={k}>{inline(s.slice(2, -2), k)}</strong>);
    else if (m[7]) out.push(<del key={k}>{inline(s.slice(2, -2), k)}</del>);
    else if (m[8]) out.push(<em key={k}>{inline(s.slice(1, -1), k)}</em>);
    else if (m[9])
      out.push(
        <Link key={k} href={`/u/${encodeURIComponent(s.slice(1))}`} onClick={(e) => e.stopPropagation()} className="font-medium text-accent hover:underline">
          {s}
        </Link>,
      );
    else if (m[10])
      out.push(
        <Link key={k} href={`/search?q=${encodeURIComponent(s)}`} onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">
          {s}
        </Link>,
      );
    last = at + s.length;
  }
  if (last < text.length) out.push(<Fragment key={`${key}${n++}`}>{text.slice(last)}</Fragment>);
  return out;
}

/** Lines joined with line breaks, each formatted. */
function lines(list: string[], key: string): ReactNode[] {
  return list.flatMap((l, i) => [...(i ? [<br key={`${key}br${i}`} />] : []), ...inline(l, `${key}l${i}`)]);
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const src = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;
  const take = (test: (l: string) => boolean) => {
    const got: string[] = [];
    while (i < src.length && test(src[i])) got.push(src[i++]);
    return got;
  };
  while (i < src.length) {
    const line = src[i];
    const key = `b${b++}`;
    if (/^```/.test(line)) {
      i++;
      const code = take((l) => !/^```/.test(l));
      i++; // the closing ```
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-xl bg-foreground/[.07] p-3 font-mono text-[13px] leading-relaxed">
          <code>{code.join("\n")}</code>
        </pre>,
      );
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = inline(line.replace(/^#{1,3}\s+/, ""), key);
      i++;
      blocks.push(
        level === 1 ? (
          <h3 key={key} className="text-xl font-bold leading-snug">{content}</h3>
        ) : level === 2 ? (
          <h4 key={key} className="text-lg font-semibold leading-snug">{content}</h4>
        ) : (
          <h5 key={key} className="font-semibold">{content}</h5>
        ),
      );
    } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      i++;
      blocks.push(<hr key={key} className="border-line" />);
    } else if (/^>\s?/.test(line)) {
      const quote = take((l) => /^>\s?/.test(l)).map((l) => l.replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="border-l-4 border-accent/50 pl-3 text-muted">
          {lines(quote, key)}
        </blockquote>,
      );
    } else if (/^\s*[-*+]\s+/.test(line)) {
      const items = take((l) => /^\s*[-*+]\s+/.test(l)).map((l) => l.replace(/^\s*[-*+]\s+/, ""));
      blocks.push(
        <ul key={key} className="list-disc space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </ul>,
      );
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const start = Number(line.match(/\d+/)![0]);
      const items = take((l) => /^\s*\d+[.)]\s+/.test(l)).map((l) => l.replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={key} start={start} className="list-decimal space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </ol>,
      );
    } else if (!line.trim()) {
      i++;
    } else {
      const para = take((l) => !!l.trim() && !/^(```|#{1,3}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|-{3,}\s*$)/.test(l));
      if (!para.length) para.push(src[i++]);
      blocks.push(<p key={key}>{lines(para, key)}</p>);
    }
  }
  return <div className={`space-y-2 break-words ${className}`}>{blocks}</div>;
}
