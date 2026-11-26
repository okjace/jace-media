"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Switch } from "@/components/ui/Switch";
import { EXTENSIONS, type ExtensionInfo, type Extensions } from "@/lib/extensions";
import { LEVELS } from "@/lib/rating";
import { SEGMENT_INFO, type SegmentCategory } from "@/lib/segments";

const GROUPS: ExtensionInfo["group"][] = ["Ads and privacy", "YouTube", "Your feeds", "Player", "Look"];
const CATEGORIES = Object.keys(SEGMENT_INFO) as SegmentCategory[];

/** Turn extensions on and off. Saved right away. */
export function ExtensionsPanel({ initial }: { initial: Extensions }) {
  const router = useRouter();
  const { current, showNotice } = useApp();
  const [ext, setExt] = useState(initial);

  async function save(next: Extensions) {
    const before = ext;
    setExt(next);
    const res = await fetch("/api/extensions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!res.ok) {
      setExt(before);
      showNotice({ kind: "error", text: "Couldn't save. Try again." });
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Content rating</h2>
        <div role="radiogroup" aria-label="Content rating" className="grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={ext.rating === l.id}
              onClick={() => save({ ...ext, rating: l.id })}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                ext.rating === l.id ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-foreground/25"
              }`}
            >
              <span className="block font-medium">{l.name}</span>
              <span className="mt-1 block text-sm text-muted">{l.blurb}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Rate any post or video from its ⋯ menu to help everyone.</p>
      </section>
      {GROUPS.map((group) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{group}</h2>
          <ul className="flex flex-col gap-2">
            {EXTENSIONS.filter((e) => e.group === group).map((e) => (
              <li key={e.id} className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{e.name}</p>
                    <p className="mt-0.5 text-sm text-muted">{e.blurb}</p>
                    {e.credit && (
                      <a href={e.credit.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-muted hover:text-foreground">
                        Uses {e.credit.name} ↗
                      </a>
                    )}
                  </div>
                  <Switch checked={ext[e.id]} onChange={(on) => save({ ...ext, [e.id]: on })} label={e.name} />
                </div>
                {e.id === "sponsorblock" && ext.sponsorblock && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    {CATEGORIES.map((c) => {
                      const on = ext.skip.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={on}
                          onClick={() => save({ ...ext, skip: on ? ext.skip.filter((x) => x !== c) : [...ext.skip, c] })}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                            on ? "border-transparent bg-foreground/[.1]" : "border-line text-muted hover:text-foreground"
                          }`}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEGMENT_INFO[c].color }} aria-hidden="true" />
                          Skip {SEGMENT_INFO[c].label.toLowerCase()}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted">
        {current ? "Saved to your account, so it's the same on every device." : "Saved on this device. Sign in to keep it on every device."}
      </p>
    </div>
  );
}
