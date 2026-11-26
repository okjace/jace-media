"use client";

import { useRouter } from "next/navigation";

/** Rename or delete a playlist. */
export function PlaylistActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  async function rename() {
    const next = prompt("Rename playlist", name);
    if (!next || next === name) return;
    await fetch(`/api/playlists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) });
    router.refresh();
  }
  async function remove() {
    if (!confirm(`Delete "${name}"? The videos stay where they are.`)) return;
    await fetch(`/api/playlists/${id}`, { method: "DELETE" });
    router.push("/playlists");
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <button type="button" onClick={rename} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
        Rename
      </button>
      <button type="button" onClick={remove} className="rounded-full px-4 py-1.5 text-sm text-danger hover:bg-danger/10">
        Delete
      </button>
    </div>
  );
}
