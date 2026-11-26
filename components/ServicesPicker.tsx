"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { SERVICES, type Service } from "@/lib/services";

/** Turn services on and off. Saved right away. */
export function ServicesPicker({ initial }: { initial: Service[] }) {
  const router = useRouter();
  const { current, showNotice } = useApp();
  const [on, setOn] = useState<Service[]>(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(s: Service) {
    const next = on.includes(s) ? on.filter((x) => x !== s) : SERVICES.map((x) => x.id).filter((x) => x === s || on.includes(x));
    if (next.length === 0) {
      setError("Keep at least one service on.");
      return;
    }
    setError(null);
    const before = on;
    setOn(next);
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ services: next }),
    });
    if (!res.ok) {
      setOn(before);
      showNotice({ kind: "error", text: "Couldn't save. Try again." });
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-panel">
        {SERVICES.map((s) => {
          const checked = on.includes(s.id);
          return (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5">
                <span>
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-sm text-muted">{s.blurb}</span>
                </span>
                <span className="relative inline-flex shrink-0">
                  <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} className="peer sr-only" />
                  <span className="h-7 w-12 rounded-full bg-foreground/15 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60" />
                  <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">
        {current ? "Saved to your account, so it's the same on every device." : "Saved on this device. Sign in to keep it on every device."}
      </p>
    </div>
  );
}
