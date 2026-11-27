"use client";

import { useEffect, useState } from "react";
import { CommentList } from "@/components/videos/CommentList";

/** A Short's comments in a panel: beside the Short on big screens, a sheet from the bottom on phones. */
export function ShortComments({ source, id, title, onClose }: { source: "youtube" | "jace"; id: string; title: string; onClose: () => void }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[75dvh] flex-col rounded-t-3xl border border-line bg-panel shadow-2xl shadow-black/50 md:static md:z-auto md:h-full md:max-h-none md:w-[380px] md:shrink-0 md:rounded-2xl"
      aria-label="Comments"
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">Comments{count !== null ? ` · ${count}` : ""}</p>
          <p className="truncate text-xs text-muted">{title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close comments" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/[.08]">
          ✕
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <CommentList source={source} id={id} small onCount={setCount} />
      </div>
    </aside>
  );
}
