"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useApp } from "@/components/AppProvider";
import type { CustomFeed, FeedRules } from "@/lib/customfeeds";
import { SERVICES, type Service } from "@/lib/services";

const PRESETS: { name: string; rules: Partial<FeedRules> }[] = [
  { name: "Subscriptions only", rules: { only: "subscriptions", sort: "latest" } },
  { name: "YouTube subscriptions", rules: { only: "subscriptions", services: ["youtube"], content: "videos", sort: "latest" } },
  { name: "Shorts from subscriptions", rules: { only: "subscriptions", services: ["youtube", "jacevideos"], content: "shorts", sort: "latest" } },
  { name: "Tech", rules: { include: ["tech", "ai", "linux", "apple", "android", "code", "programming"], sort: "recommended" } },
  { name: "Jace only", rules: { services: ["jace", "jacevideos"] } },
];

const DEFAULT: FeedRules = {
  services: SERVICES.map((s) => s.id),
  only: "all",
  content: "all",
  include: [],
  exclude: [],
  sort: "recommended",
  folder: null,
};

const box = "rounded-xl border border-line bg-background px-3 py-2 text-[15px] outline-none focus:border-accent";

function Choice<T extends string>({ value, options, onChange, name }: { value: T; options: [T, string][]; onChange: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3.5 py-1.5 text-sm ${value === v ? "bg-accent font-medium text-on-accent" : "bg-foreground/[.06] hover:bg-foreground/[.1]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Make or change a custom feed. */
export function FeedEditor({ feed, onDone }: { feed?: CustomFeed; onDone?: () => void }) {
  const router = useRouter();
  const { showNotice } = useApp();
  const [name, setName] = useState(feed?.name ?? "");
  const [rules, setRules] = useState<FeedRules>(feed?.rules ?? DEFAULT);
  const [include, setInclude] = useState((feed?.rules.include ?? []).join(", "));
  const [exclude, setExclude] = useState((feed?.rules.exclude ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FeedRules>) => setRules((r) => ({ ...r, ...patch }));

  function toggle(s: Service) {
    set({ services: rules.services.includes(s) ? rules.services.filter((x) => x !== s) : [...rules.services, s] });
  }

  function preset(p: (typeof PRESETS)[number]) {
    setName(p.name);
    setRules({ ...DEFAULT, ...p.rules });
    setInclude((p.rules.include ?? []).join(", "));
    setExclude("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (rules.services.length === 0) {
      setError("Pick at least one service.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(feed ? `/api/feeds/${feed.id}` : "/api/feeds", {
      method: feed ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, rules: { ...rules, include, exclude } }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; feed?: CustomFeed };
    setBusy(false);
    if (!res.ok || !data.feed) {
      setError(data.error ?? "Couldn't save. Try again.");
      return;
    }
    showNotice({ kind: "info", text: feed ? "Feed saved." : `Made "${data.feed.name}". It's in your tabs.` });
    onDone?.();
    router.push(`/feeds/${data.feed.id}`);
    router.refresh();
  }

  async function remove() {
    if (!feed || !confirm(`Delete "${feed.name}"?`)) return;
    await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" });
    router.push("/feeds");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5">
      {!feed && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Start from</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} type="button" onClick={() => preset(p)} className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-foreground/[.05]">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="My feed" className={box} required />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Services</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <input type="checkbox" checked={rules.services.includes(s.id)} onChange={() => toggle(s.id)} className="accent-[var(--accent)]" />
              {s.label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">From</span>
        <Choice name="From" value={rules.only} onChange={(only) => set({ only })} options={[["all", "Everything"], ["subscriptions", "Subscriptions only"]]} />
        {rules.only === "subscriptions" && rules.services.includes("hackernews") && (
          <span className="text-xs text-muted">Hacker News has no accounts to follow, so it&apos;s skipped in subscriptions-only feeds.</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Show</span>
        <Choice
          name="Show"
          value={rules.content}
          onChange={(content) => set({ content })}
          options={[["all", "Posts and videos"], ["posts", "Posts"], ["videos", "Videos"], ["shorts", "Shorts"]]}
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Only show things mentioning (optional)</span>
        <input value={include} onChange={(e) => setInclude(e.target.value)} placeholder="minecraft, space, music" className={box} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Hide things mentioning (optional)</span>
        <input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="spoilers, politics" className={box} />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Order</span>
        <Choice name="Order" value={rules.sort} onChange={(sort) => set({ sort })} options={[["recommended", "Recommended"], ["latest", "Newest first"]]} />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        {feed ? (
          <button type="button" onClick={remove} className="rounded-full px-4 py-2 text-sm text-danger hover:bg-danger/10">
            Delete feed
          </button>
        ) : (
          <span />
        )}
        <button type="submit" disabled={busy} className="rounded-full bg-accent px-6 py-2 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
          {busy ? "Saving…" : feed ? "Save" : "Make feed"}
        </button>
      </div>
    </form>
  );
}
