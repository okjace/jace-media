"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { readTakeout, type TakeoutData } from "@/lib/takeout";

type Step = { kind: "pick" } | { kind: "reading" } | { kind: "ready"; data: TakeoutData } | { kind: "sending"; done: number; total: number } | { kind: "done"; subs: number; history: number; liked: number };

async function send(body: unknown): Promise<{ subs: number; history: number; liked: number }> {
  const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The import stopped. Try again.");
  return res.json();
}

/** Reads a Google Takeout export in the browser, then sends the parts that matter in small chunks. */
export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const zip = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  async function read(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setStep({ kind: "reading" });
    try {
      const data = await readTakeout([...files]);
      if (!data.subscriptions.length && !data.history.length && !data.liked.length) {
        throw new Error("No YouTube data found. Choose the Takeout .zip, or the folder you extracted it to.");
      }
      setStep({ kind: "ready", data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that.");
      setStep({ kind: "pick" });
    }
  }

  async function importAll(data: TakeoutData) {
    const chunks: unknown[] = [{ subscriptions: data.subscriptions }];
    for (let i = 0; i < data.history.length; i += 1000) chunks.push({ history: data.history.slice(i, i + 1000) });
    for (let i = 0; i < data.liked.length; i += 2500) chunks.push({ liked: data.liked.slice(i, i + 2500) });
    const total = { subs: 0, history: 0, liked: 0 };
    setError(null);
    try {
      for (let i = 0; i < chunks.length; i++) {
        setStep({ kind: "sending", done: i, total: chunks.length });
        const r = await send(chunks[i]);
        total.subs += r.subs;
        total.history += r.history;
        total.liked += r.liked;
      }
      setStep({ kind: "done", ...total });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import stopped. Try again.");
      setStep({ kind: "ready", data });
    }
  }

  const button = "rounded-full px-5 py-2 font-medium transition-colors";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5">
      {step.kind === "pick" && (
        <>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>
              Go to{" "}
              <a href="https://takeout.google.com/settings/takeout/custom/youtube" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Google Takeout → YouTube
              </a>
              .
            </li>
            <li>Under &quot;Multiple formats&quot;, set history to <b>JSON</b> (HTML works too). You can untick &quot;videos&quot; to make it much smaller.</li>
            <li>Create the export, download the .zip when Google emails you, and choose it here.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <input ref={zip} type="file" accept=".zip,.json,.csv,.html" multiple className="hidden" onChange={(e) => read(e.target.files)} />
            <input
              ref={(el) => {
                folder.current = el;
                el?.setAttribute("webkitdirectory", "");
              }}
              type="file"
              className="hidden"
              onChange={(e) => read(e.target.files)}
            />
            <button type="button" onClick={() => zip.current?.click()} className={`${button} bg-accent text-on-accent hover:bg-accent-hover`}>
              Choose the .zip
            </button>
            <button type="button" onClick={() => folder.current?.click()} className={`${button} border border-line hover:bg-foreground/[.05]`}>
              Choose an extracted folder
            </button>
          </div>
          <p className="text-xs text-muted">The export is read on your device. Only your subscriptions, watch history, and likes are sent to Jace Media.</p>
        </>
      )}
      {step.kind === "reading" && <p className="text-sm">Reading your export…</p>}
      {step.kind === "ready" && (
        <>
          <p className="font-medium">Found in your export:</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-xl bg-foreground/[.05] p-3"><b className="block text-xl">{step.data.subscriptions.length}</b>subscriptions</li>
            <li className="rounded-xl bg-foreground/[.05] p-3"><b className="block text-xl">{step.data.history.length}</b>videos watched</li>
            <li className="rounded-xl bg-foreground/[.05] p-3"><b className="block text-xl">{step.data.liked.length}</b>liked videos</li>
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => importAll(step.data)} className={`${button} bg-accent text-on-accent hover:bg-accent-hover`}>
              Import
            </button>
            <button type="button" onClick={() => setStep({ kind: "pick" })} className={`${button} border border-line hover:bg-foreground/[.05]`}>
              Choose something else
            </button>
          </div>
        </>
      )}
      {step.kind === "sending" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">Importing… {Math.round((step.done / step.total) * 100)}%</p>
          <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full bg-accent transition-all" style={{ width: `${(step.done / step.total) * 100}%` }} />
          </div>
        </div>
      )}
      {step.kind === "done" && (
        <>
          <p className="font-medium text-accent">Done!</p>
          <p className="text-sm">
            Imported {step.subs} subscriptions, {step.history} watched videos, and {step.liked} likes. Your recommendations now use them.
          </p>
          <div className="flex gap-2">
            <Link href="/" className={`${button} bg-accent text-on-accent hover:bg-accent-hover`}>See recommendations</Link>
            <Link href="/subscriptions" className={`${button} border border-line hover:bg-foreground/[.05]`}>Subscriptions</Link>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
