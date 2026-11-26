"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { LiveAvatar } from "@/components/live/LiveAvatar";
import { LiveChat } from "@/components/live/LiveChat";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function since(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/**
 * The live-stream layout used by Jace Media lives and YouTube lives: the
 * player with chat beside it, a live header (viewers, how long it's been on),
 * theater mode, and a chat you can hide. YouTube lives can also show
 * YouTube's own chat (that part loads from YouTube).
 */
export function LiveStage({
  player,
  title,
  host,
  live,
  viewers: initialViewers,
  startedAt,
  chatId,
  youtubeId,
  statsUrl,
  actions,
  below,
}: {
  player: ReactNode;
  title: string;
  host: { name: string; picture: string | null; href: string | null; note?: string };
  live: boolean;
  viewers?: number | null;
  startedAt?: string | null;
  /** Jace Media chat room id. */
  chatId: string;
  youtubeId?: string;
  /** Polled every 30 seconds for { viewers }. */
  statsUrl?: string;
  actions?: ReactNode;
  below?: ReactNode;
}) {
  const [theater, setTheater] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [ytChat, setYtChat] = useState(false);
  const [viewers, setViewers] = useState(initialViewers ?? null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!statsUrl || !live) return;
    const t = setInterval(async () => {
      try {
        const data = (await (await fetch(statsUrl)).json()) as { viewers?: number | null; stream?: { viewers: number } };
        const v = data.viewers ?? data.stream?.viewers;
        if (typeof v === "number") setViewers(v);
      } catch {}
    }, 30_000);
    return () => clearInterval(t);
  }, [statsUrl, live]);

  // Without statsUrl, the page passes fresh numbers in itself.
  const shownViewers = statsUrl ? viewers : (initialViewers ?? null);
  const showChat = chatOpen;
  const side = showChat && !theater;
  const onFor = live ? since(startedAt, now) : null;

  const chat = ytChat && youtubeId ? (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
        <span className="font-semibold">YouTube chat</span>
        <button type="button" onClick={() => setYtChat(false)} className="text-accent hover:underline">
          Jace Media chat
        </button>
      </div>
      <iframe
        title="YouTube live chat"
        src={`https://www.youtube.com/live_chat?v=${youtubeId}&embed_domain=${typeof window !== "undefined" ? window.location.hostname : ""}&dark_theme=1`}
        className="w-full flex-1 bg-panel"
      />
    </div>
  ) : (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1">
        <LiveChat streamId={chatId} ended={!live} />
      </div>
      {youtubeId && live && (
        <button
          type="button"
          onClick={() => setYtChat(true)}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
          title="Loads YouTube's chat, so YouTube can see you"
        >
          Show YouTube&apos;s chat (loads from YouTube)
        </button>
      )}
    </div>
  );

  return (
    <div className={`grid gap-5 ${side ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-[minmax(0,1fr)]"}`}>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="-mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-2xl">{player}</div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {live ? (
            <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">● Live</span>
          ) : (
            <span className="rounded-md bg-foreground/[.08] px-2 py-0.5 text-xs font-semibold uppercase">Ended</span>
          )}
          {live && shownViewers !== null && <span className="font-medium">{compact.format(shownViewers)} watching</span>}
          {onFor && <span className="text-muted">· live for {onFor}</span>}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setTheater(!theater)}
            className="hidden rounded-full bg-foreground/[.07] px-3 py-1.5 text-xs font-medium hover:bg-foreground/[.12] lg:inline-flex"
            aria-pressed={theater}
          >
            {theater ? "◱ Side chat" : "▭ Theater"}
          </button>
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            className="rounded-full bg-foreground/[.07] px-3 py-1.5 text-xs font-medium hover:bg-foreground/[.12]"
            aria-pressed={chatOpen}
          >
            {chatOpen ? "Hide chat" : "💬 Show chat"}
          </button>
        </div>

        <h1 className="text-xl font-semibold leading-snug">{title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {host.href ? (
            <Link href={host.href} className="flex min-w-0 items-center gap-3">
              {live ? <LiveAvatar name={host.name} src={host.picture} size={44} /> : <Avatar name={host.name} src={host.picture} size={44} />}
              <span className="min-w-0">
                <span className="block truncate font-semibold">{host.name}</span>
                {host.note && <span className="block text-xs text-muted">{host.note}</span>}
              </span>
            </Link>
          ) : (
            <span className="flex items-center gap-3 font-semibold">
              {live ? <LiveAvatar name={host.name} src={host.picture} size={44} /> : <Avatar name={host.name} src={host.picture} size={44} />}
              {host.name}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
        </div>
        {theater && showChat && <div className="h-[460px]">{chat}</div>}
        {below}
      </div>
      {side && <aside className="lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)] lg:self-start">{chat}</aside>}
    </div>
  );
}
