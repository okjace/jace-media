"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Composer } from "@/components/feed/Composer";
import { Icon } from "./icons";

/** The + in the header: write a post (right here), upload a video or Short, or host a live game. */
export function CreateMenu() {
  const [open, setOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  useEffect(() => {
    if (!posting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPosting(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [posting]);

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-foreground/[.06]";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Create"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-1.5 rounded-full border border-line px-2.5 text-sm font-medium transition-colors hover:bg-foreground/[.06] sm:px-3.5"
      >
        <Icon name="plus" size={18} />
        <span className="hidden md:inline">Create</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-60 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl shadow-black/40">
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              setPosting(true);
            }}
          >
            <span aria-hidden="true">✏️</span> New post
          </button>
          <Link href="/upload" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <span aria-hidden="true">🎬</span> Upload video
          </Link>
          <Link href="/upload?short=1" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <span aria-hidden="true">📱</span> Upload a Short
          </Link>
          <Link href="/live/go" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <span aria-hidden="true">🔴</span> Go live
          </Link>
          <a href="https://jace-live.vercel.app/live/host/new" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <span aria-hidden="true">🎮</span> Host a live game
          </a>
        </div>
      )}
      {posting && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-3 pt-[10vh]" role="dialog" aria-label="New post">
          <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setPosting(false)} />
          <div className="relative w-full max-w-xl">
            <div className="mb-2 flex items-center justify-between text-white">
              <span className="font-semibold">New post</span>
              <button type="button" onClick={() => setPosting(false)} className="rounded-full bg-panel px-3 py-1 text-sm text-foreground">
                Cancel
              </button>
            </div>
            <Composer onPosted={() => setPosting(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
