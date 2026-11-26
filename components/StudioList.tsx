"use client";

import { confirmDialog } from "@/components/ui/Dialog";
import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { downloadHref, timeAgo } from "@/lib/format";
import type { JaceVideo, Visibility } from "@/lib/types";

const LABEL: Record<Visibility, string> = { public: "Public", unlisted: "Unlisted", private: "Private" };

/** Your uploads, with visibility and delete. */
export function StudioList({ initial }: { initial: JaceVideo[] }) {
  const { showNotice } = useApp();
  const [videos, setVideos] = useState(initial);

  async function setVisibility(v: JaceVideo, visibility: Visibility) {
    setVideos((list) => list.map((x) => (x.id === v.id ? { ...x, visibility } : x)));
    const res = await fetch(`/api/videos/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility }) });
    if (!res.ok) showNotice({ kind: "error", text: "Couldn't change that. Try again." });
  }

  async function remove(v: JaceVideo) {
    if (!(await confirmDialog({ title: `Delete "${v.title}" from Jace?`, message: "This can't be undone.", confirm: "Delete", danger: true }))) return;
    const res = await fetch(`/api/videos/${v.id}`, { method: "DELETE" });
    if (res.ok) setVideos((list) => list.filter((x) => x.id !== v.id));
    else showNotice({ kind: "error", text: "Couldn't delete that. Try again." });
  }

  if (videos.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
        No videos yet.{" "}
        <Link href="/upload" className="text-accent hover:underline">
          Upload your first one
        </Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {videos.map((v) => (
        <li key={v.id} className="flex items-center gap-4 p-3">
          <Link href={`/watch/jace/${v.id}`} className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-black/30">
            {v.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/watch/jace/${v.id}`} className="line-clamp-2 font-medium hover:underline">
              {v.title}
            </Link>
            <p className="text-xs text-muted" suppressHydrationWarning>
              {timeAgo(v.created_at)} · {v.likes} like{v.likes === 1 ? "" : "s"} · {v.comment_count} comment{v.comment_count === 1 ? "" : "s"}
            </p>
          </div>
          <select
            value={v.visibility}
            onChange={(e) => setVisibility(v, e.target.value as Visibility)}
            aria-label={`Who can see ${v.title}`}
            className="h-9 rounded-full border border-line bg-background px-3 text-sm"
          >
            {(Object.keys(LABEL) as Visibility[]).map((k) => (
              <option key={k} value={k}>
                {LABEL[k]}
              </option>
            ))}
          </select>
          <a href={downloadHref(v.url, v.title)} download className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-foreground/[.06] hover:text-foreground">
            Download
          </a>
          <button type="button" onClick={() => remove(v)} className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-danger/10 hover:text-danger">
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
