"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { signInHref, useApp } from "@/components/AppProvider";
import type { VideoCard } from "@/lib/types";

type Playlist = { id: string; name: string; kind: "watch_later" | "playlist" };

/** Save a video to Watch Later or any playlist (and make new playlists). */
export function SaveButton({ video }: { video: VideoCard }) {
  const { current, showNotice } = useApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Playlist[] | null>(null);
  const [has, setHas] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    fetch(`/api/playlists?source=${video.source}&id=${encodeURIComponent(video.id)}`)
      .then((r) => r.json())
      .then((d: { playlists: Playlist[]; has: string[] }) => {
        setLists(d.playlists);
        setHas(new Set(d.has));
      })
      .catch(() => setLists([]));
    return () => document.removeEventListener("mousedown", close);
  }, [open, video.source, video.id]);

  async function toggle(p: Playlist) {
    const on = !has.has(p.id);
    setHas((s) => {
      const n = new Set(s);
      if (on) n.add(p.id);
      else n.delete(p.id);
      return n;
    });
    await fetch(`/api/playlists/${p.id}/items`, {
      method: on ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(on ? { video } : { source: video.source, id: video.id }),
    });
    showNotice({ kind: "info", text: on ? `Saved to ${p.name}.` : `Removed from ${p.name}.` });
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/playlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const d = (await res.json()) as { playlist?: Playlist; error?: string };
    if (!d.playlist) {
      showNotice({ kind: "error", text: d.error ?? "Couldn't make that playlist." });
      return;
    }
    setLists((l) => [...(l ?? []), d.playlist!]);
    setName("");
    await toggle(d.playlist);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => (current ? setOpen((o) => !o) : window.location.assign(signInHref(pathname)))}
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full bg-foreground/[.07] px-4 text-sm font-medium transition-colors hover:bg-foreground/[.12]"
      >
        <span aria-hidden="true">＋</span> Save
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-64 rounded-2xl border border-line bg-panel p-2 shadow-2xl shadow-black/30">
          <p className="px-2 pb-1 pt-1 text-sm font-semibold">Save to…</p>
          {lists === null ? (
            <p className="px-2 py-2 text-sm text-muted">Loading…</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {lists.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-foreground/[.06]">
                    <input type="checkbox" checked={has.has(p.id)} onChange={() => toggle(p)} className="h-4 w-4 accent-[var(--accent)]" />
                    <span className="truncate">{p.kind === "watch_later" ? "🕒 Watch Later" : p.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={create} className="mt-1 flex gap-1 border-t border-line pt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="New playlist"
              aria-label="New playlist name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-background px-2 text-sm outline-none focus:border-accent"
            />
            <button type="submit" className="rounded-lg bg-accent px-3 text-sm font-medium text-on-accent">
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
