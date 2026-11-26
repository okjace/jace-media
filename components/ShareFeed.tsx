"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInHref, useApp } from "@/components/AppProvider";
import { copyText } from "@/components/ui/ContextMenu";

const btn = "rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05] disabled:opacity-50";

/** On your own feed: turn the share link on (and copy it) or off. */
export function ShareFeedButton({ feedId, initial }: { feedId: string; initial: boolean }) {
  const { showNotice } = useApp();
  const [shared, setShared] = useState(initial);
  const [busy, setBusy] = useState(false);
  const link = () => `${window.location.origin}/feeds/shared/${feedId}`;

  async function set(next: boolean) {
    setBusy(true);
    const res = await fetch(`/api/feeds/${feedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shared: next }) });
    setBusy(false);
    if (!res.ok) return showNotice({ kind: "error", text: "Couldn't change sharing." });
    setShared(next);
    if (next) {
      const url = link();
      if ("share" in navigator && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        await navigator.share({ title: "My Jace Media feed", url }).catch(() => {});
      } else {
        showNotice((await copyText(url)) ? { kind: "info", text: "Share link copied. Anyone with it can see this feed and save a copy." } : { kind: "info", text: url });
      }
    } else showNotice({ kind: "info", text: "The share link is off." });
  }

  return shared ? (
    <span className="flex gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => showNotice((await copyText(link())) ? { kind: "info", text: "Share link copied." } : { kind: "info", text: link() })}
        className={`${btn} border-accent/50 text-accent`}
      >
        🔗 Copy link
      </button>
      <button type="button" disabled={busy} onClick={() => set(false)} className={btn} title="Stop sharing">
        Stop sharing
      </button>
    </span>
  ) : (
    <button type="button" disabled={busy} onClick={() => set(true)} className={btn}>
      📤 Share
    </button>
  );
}

/** On someone's shared feed: save a copy to your own feeds. */
export function SaveFeedCopy({ feedId }: { feedId: string }) {
  const { current, showNotice } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!current) {
    return (
      <a href={signInHref(`/feeds/shared/${feedId}`)} className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover">
        Sign in to save this feed
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/feeds/${feedId}`, { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as { feed?: { id: string }; error?: string };
        setBusy(false);
        if (!res.ok || !data.feed) return showNotice({ kind: "error", text: data.error ?? "Couldn't save it." });
        showNotice({ kind: "info", text: "Saved to your feeds." });
        router.push(`/feeds/${data.feed.id}`);
        router.refresh();
      }}
      className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
    >
      {busy ? "Saving…" : "＋ Save to my feeds"}
    </button>
  );
}
