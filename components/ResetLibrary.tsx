"use client";

import { confirmDialog } from "@/components/ui/Dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";

const PARTS = [
  { id: "history", label: "Watch history", hint: "What you watched and where you stopped" },
  { id: "likes", label: "Likes and dislikes", hint: "Videos you liked or disliked" },
  { id: "playlists", label: "Watch Later and playlists", hint: "Everything you saved" },
  { id: "subscriptions", label: "Subscriptions", hint: "Everyone you follow, on every service" },
  { id: "hidden", label: "Hidden videos, channels, and posts", hint: "Brings them all back" },
  { id: "feeds", label: "Custom feeds", hint: "Feeds you made" },
  { id: "ratings", label: "Your content ratings", hint: "Things you rated appropriate or inappropriate" },
] as const;

/** Pick parts of your library and wipe them. Posts and comments aren't touched. */
export function ResetLibrary({ counts }: { counts: Partial<Record<string, number>> }) {
  const router = useRouter();
  const { showNotice } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const all = picked.length === PARTS.length;

  async function reset() {
    const names = PARTS.filter((p) => picked.includes(p.id)).map((p) => p.label.toLowerCase());
    if (!(await confirmDialog({ title: `Reset ${all ? "your whole library" : names.join(", ")}?`, message: "This can't be undone.", confirm: "Reset", danger: true }))) return;
    setBusy(true);
    const res = await fetch("/api/library/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parts: picked }) });
    setBusy(false);
    if (res.ok) {
      setPicked([]);
      showNotice({ kind: "info", text: all ? "Your library is reset. Recommendations start fresh." : "Done. Those are reset." });
      router.refresh();
    } else showNotice({ kind: "error", text: "Couldn't reset that. Try again." });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-danger/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Reset your library</h2>
          <p className="text-sm text-muted">Pick what to clear. Your posts and comments stay.</p>
        </div>
        <button type="button" onClick={() => setPicked(all ? [] : PARTS.map((p) => p.id))} className="text-sm text-accent hover:underline">
          {all ? "Select none" : "Select everything"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PARTS.map((p) => {
          const on = picked.includes(p.id);
          return (
            <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${on ? "border-danger/60 bg-danger/[.06]" : "border-line hover:bg-foreground/[.03]"}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => setPicked((list) => (on ? list.filter((x) => x !== p.id) : [...list, p.id]))}
                className="mt-0.5 h-4 w-4 accent-[var(--danger)]"
              />
              <span>
                <span className="block font-medium">
                  {p.label}
                  {counts[p.id] !== undefined && <span className="font-normal text-muted"> ({counts[p.id]})</span>}
                </span>
                <span className="block text-xs text-muted">{p.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reset}
          disabled={!picked.length || busy}
          className="h-10 rounded-full bg-danger px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Resetting…" : all ? "Reset everything" : `Reset ${picked.length || ""} selected`.replace("  ", " ")}
        </button>
      </div>
    </section>
  );
}
