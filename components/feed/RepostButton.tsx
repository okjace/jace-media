"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signInHref, useApp } from "@/components/AppProvider";
import type { FeedItem } from "@/lib/types";
import { Composer } from "./Composer";

/** Repost (share as is) or Quote (share with your own words) any post, from any network. */
export function RepostButton({ item, count }: { item: FeedItem; count?: string }) {
  const { current, showNotice } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  async function repost() {
    setMenu(false);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "", quote: { network: item.network, id: item.id } }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    showNotice(res.ok ? { kind: "info", text: "Reposted to Jace." } : { kind: "error", text: data.error ?? "Couldn't repost." });
    if (res.ok) router.refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => (current ? setMenu((m) => !m) : window.location.assign(signInHref(pathname)))}
        aria-label="Repost or quote"
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-foreground/[.06] hover:text-foreground"
      >
        <span aria-hidden="true">↻</span>
        {count}
      </button>
      {menu && (
        <div role="menu" className="absolute bottom-9 left-0 z-30 w-44 overflow-hidden rounded-xl border border-line bg-panel py-1 text-sm shadow-xl shadow-black/30">
          <button type="button" role="menuitem" onClick={repost} className="block w-full px-4 py-2 text-left hover:bg-foreground/[.06]">
            ↻ Repost
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              setQuoting(true);
            }}
            className="block w-full px-4 py-2 text-left hover:bg-foreground/[.06]"
          >
            ❝ Quote
          </button>
        </div>
      )}
      {quoting && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" role="dialog" aria-label="Quote post">
          <div className="w-full max-w-xl">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setQuoting(false)} className="rounded-full bg-panel px-3 py-1 text-sm">
                Cancel
              </button>
            </div>
            <Composer quote={item} placeholder="Add your thoughts" onPosted={() => setQuoting(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
