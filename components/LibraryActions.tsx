"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";

/** Clear watch history / bring back hidden videos. */
export function LibraryActions({ hidden }: { hidden: number }) {
  const router = useRouter();
  const { showNotice } = useApp();
  async function run(url: string, question: string, done: string) {
    if (!confirm(question)) return;
    const res = await fetch(url, { method: "DELETE" });
    showNotice(res.ok ? { kind: "info", text: done } : { kind: "error", text: "Couldn't do that. Try again." });
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => run("/api/history", "Clear your whole watch history? Recommendations will start over. This can't be undone.", "Watch history cleared.")}
        className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-danger/10 hover:text-danger"
      >
        Clear watch history
      </button>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => run("/api/hidden", `Bring back the ${hidden} videos and channels you hid?`, "Hidden videos and channels are back.")}
          className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]"
        >
          Un-hide {hidden} videos and channels
        </button>
      )}
    </div>
  );
}
