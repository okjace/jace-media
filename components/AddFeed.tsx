"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useApp } from "@/components/AppProvider";

/** Follow a news site or blog by its address (the feed is found automatically). */
export function AddFeed({ suggestions }: { suggestions: { name: string; url: string }[] }) {
  const router = useRouter();
  const { showNotice } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function follow(address: string) {
    setBusy(true);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "rss", ref: address, name: address }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; name?: string };
    setBusy(false);
    if (!res.ok) {
      showNotice({ kind: "error", text: data.error ?? "Couldn't follow that site." });
      return;
    }
    setUrl("");
    showNotice({ kind: "info", text: `Following ${data.name ?? "that site"}. Its articles show up in Subscriptions.` });
    router.refresh();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (url.trim()) follow(url.trim());
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4">
      <div>
        <h2 className="font-semibold">Follow a news site or blog</h2>
        <p className="text-sm text-muted">Paste its address. Jace Media finds its feed.</p>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="example.com or a feed address"
          aria-label="Website or feed address"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-background px-4 text-sm outline-none focus:border-accent"
        />
        <button type="submit" disabled={busy || !url.trim()} className="rounded-full bg-accent px-5 text-sm font-medium text-on-accent disabled:opacity-50">
          {busy ? "Checking…" : "Follow"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s.url} type="button" disabled={busy} onClick={() => follow(s.url)} className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-foreground/[.05]">
            + {s.name}
          </button>
        ))}
      </div>
    </section>
  );
}
