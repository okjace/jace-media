"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { signInHref, useApp } from "@/components/AppProvider";
import { api } from "@/lib/liveClient";

type Message = { id: string; author: { name: string; handle: string; picture: string | null }; body: string; at: number };

/** Live chat beside a stream. Checks for new messages every two seconds. */
export function LiveChat({ streamId, ended = false }: { streamId: string; ended?: boolean }) {
  const { current, showNotice } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const stick = useRef(true);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const { messages: fresh } = await api<{ messages: Message[] }>(`/api/live/${streamId}/chat?after=${last.current}`);
        if (fresh.length && !stop) {
          last.current = fresh[fresh.length - 1].at;
          setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))].slice(-200));
        }
      } catch {}
    };
    void load();
    const t = setInterval(load, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [streamId]);

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await api(`/api/live/${streamId}/chat`, "POST", { body });
      setText("");
      const { messages: fresh } = await api<{ messages: Message[] }>(`/api/live/${streamId}/chat?after=${last.current}`);
      if (fresh.length) {
        last.current = fresh[fresh.length - 1].at;
        stick.current = true;
        setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
      }
    } catch (err) {
      showNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">Live chat</p>
      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3 text-sm"
      >
        {messages.length === 0 && <p className="py-6 text-center text-xs text-muted">No messages yet. Say hi!</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2">
            <Avatar name={m.author.name} src={m.author.picture} size={22} />
            <p className="min-w-0 break-words leading-snug">
              <span className="mr-1.5 font-semibold text-muted">{m.author.name}</span>
              {m.body}
            </p>
          </div>
        ))}
      </div>
      {ended ? (
        <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">Chat is closed.</p>
      ) : current ? (
        <form onSubmit={send} className="flex gap-2 border-t border-line p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="Chat…"
            aria-label="Chat message"
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-background px-4 text-sm outline-none focus:border-accent"
          />
          <button type="submit" disabled={sending || !text.trim()} className="h-10 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">
            Send
          </button>
        </form>
      ) : (
        <a href={signInHref(`/live/watch/${streamId}`)} className="border-t border-line px-4 py-3 text-center text-sm text-accent hover:underline">
          Sign in to chat
        </a>
      )}
    </div>
  );
}
