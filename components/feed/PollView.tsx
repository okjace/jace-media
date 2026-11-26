"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { signInHref, useApp } from "@/components/AppProvider";
import { timeAgo } from "@/lib/format";
import type { Poll } from "@/lib/types";

/** A poll in a post: choices to tap, then results once you've voted (or it ended). */
export function PollView({ postId, poll: initial }: { postId: string; poll: Poll }) {
  const { current, showNotice } = useApp();
  const pathname = usePathname();
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState(false);
  const showResults = poll.myVote !== null || poll.ended;

  async function vote(option: number) {
    if (!current) {
      window.location.assign(signInHref(pathname));
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option }) });
    const data = (await res.json().catch(() => ({}))) as { poll?: Poll; error?: string };
    setBusy(false);
    if (data.poll) setPoll(data.poll);
    else showNotice({ kind: "error", text: data.error ?? "Couldn't vote." });
  }

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      {poll.options.map((o, i) => {
        const pct = poll.total ? Math.round((poll.counts[i] / poll.total) * 100) : 0;
        return showResults ? (
          <div key={i} className="relative overflow-hidden rounded-xl border border-line px-3 py-2 text-sm">
            <div className={`absolute inset-y-0 left-0 ${poll.myVote === i ? "bg-accent/25" : "bg-foreground/[.08]"}`} style={{ width: `${pct}%` }} />
            <div className="relative flex justify-between gap-3">
              <span className={poll.myVote === i ? "font-semibold" : ""}>
                {o} {poll.myVote === i && "✓"}
              </span>
              <span className="text-muted">{pct}%</span>
            </div>
          </div>
        ) : (
          <button
            key={i}
            type="button"
            disabled={busy}
            onClick={() => vote(i)}
            className="rounded-xl border border-accent/50 px-3 py-2 text-left text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
          >
            {o}
          </button>
        );
      })}
      <p className="text-xs text-muted" suppressHydrationWarning>
        {poll.total} vote{poll.total === 1 ? "" : "s"} · {poll.ended ? "Final results" : `Ends ${timeAgo(poll.endsAt)}`}
      </p>
    </div>
  );
}
