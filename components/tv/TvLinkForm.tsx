"use client";

import { useState, type FormEvent } from "react";

export function TvLinkForm({ code: initial, name }: { code: string; name: string }) {
  const [code, setCode] = useState(initial);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    const res = await fetch("/api/tv", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) setState("done");
    else {
      setState("idle");
      setError(data.error ?? "That didn't work. Try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent/40 bg-accent/[.07] p-6 text-center">
        <span className="text-5xl" aria-hidden="true">📺</span>
        <p className="text-lg font-semibold">Done! Your TV is ready</p>
        <p className="text-sm text-muted">Look at your TV. It&apos;ll be ready in a moment.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Code on your TV
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          inputMode="text"
          autoCapitalize="characters"
          placeholder="ABC123"
          className="h-14 rounded-xl border border-line bg-background text-center font-mono text-3xl tracking-[0.3em] outline-none focus:border-accent"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={code.length !== 6 || state === "busy"} className="h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
        {state === "busy" ? "Working…" : `Sign in / unlock the TV as ${name}`}
      </button>
    </form>
  );
}
