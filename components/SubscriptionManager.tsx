"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/components/AppProvider";
import type { SubKind, Subscription } from "@/lib/library";

const KIND: Record<SubKind, string> = { youtube: "YouTube", jace: "Jace", bluesky: "Bluesky", mastodon: "Mastodon", lemmy: "Lemmy", rss: "News & blogs" };

/** Every subscription, with folders and unsubscribe. */
export function SubscriptionManager({ initial }: { initial: Subscription[] }) {
  const router = useRouter();
  const { showNotice } = useApp();
  const [subs, setSubs] = useState(initial);
  const [filter, setFilter] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const folders = useMemo(() => [...new Set(subs.map((s) => s.folder).filter((f): f is string => !!f))].sort(), [subs]);
  const shown = subs.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));

  async function move(s: Subscription, folder: string | null) {
    setSubs((list) => list.map((x) => (x.kind === s.kind && x.ref === s.ref ? { ...x, folder } : x)));
    const res = await fetch("/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: s.kind, ref: s.ref, folder }),
    });
    if (!res.ok) showNotice({ kind: "error", text: "Couldn't move that. Try again." });
    router.refresh();
  }

  async function remove(s: Subscription) {
    if (!confirm(`Unsubscribe from ${s.name}?`)) return;
    setSubs((list) => list.filter((x) => !(x.kind === s.kind && x.ref === s.ref)));
    await fetch("/api/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    router.refresh();
  }

  const allFolders = newFolder.trim() && !folders.includes(newFolder.trim()) ? [...folders, newFolder.trim()] : folders;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Search ${subs.length} subscriptions`}
          aria-label="Search subscriptions"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm outline-none focus:border-accent"
        />
        <input
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          maxLength={30}
          placeholder="New folder name"
          aria-label="New folder name"
          className="h-10 w-48 rounded-full border border-line bg-panel px-4 text-sm outline-none focus:border-accent"
        />
      </div>
      {newFolder.trim() && <p className="text-xs text-muted">Now pick &quot;{newFolder.trim()}&quot; in the folder menu next to any subscription.</p>}
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
        {shown.map((s) => (
          <li key={`${s.kind}:${s.ref}`} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={s.name} src={s.picture} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block truncate text-xs text-muted">{KIND[s.kind]}</span>
            </span>
            <select
              value={s.folder ?? ""}
              onChange={(e) => move(s, e.target.value || null)}
              aria-label={`Folder for ${s.name}`}
              className="h-9 max-w-40 rounded-full border border-line bg-background px-3 text-sm outline-none focus:border-accent"
            >
              <option value="">No folder</option>
              {allFolders.map((f) => (
                <option key={f} value={f}>
                  📁 {f}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => remove(s)} className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-danger/10 hover:text-danger">
              Unsubscribe
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No subscriptions match.</li>}
      </ul>
    </div>
  );
}
