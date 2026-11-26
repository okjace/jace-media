"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Jace Media's own confirm and text-entry dialogs, used instead of the
 * browser's confirm() and prompt() pop-ups.
 *
 *   if (!(await confirmDialog({ title: "Delete this post?", confirm: "Delete", danger: true }))) return;
 *   const name = await promptDialog({ title: "Rename playlist", value: "Old name" });
 */

type Request = {
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
  /** Set for a text box (prompt). */
  input?: { value: string; placeholder?: string; maxLength?: number };
  resolve: (value: boolean | string | null) => void;
  id: number;
};
let nextId = 0;

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(req: Omit<Request, "resolve" | "id">): Promise<boolean | string | null> {
  // A new dialog replaces one that's still open (which counts as cancelled).
  current?.resolve(current.input ? null : false);
  return new Promise((resolve) => {
    current = { ...req, resolve, id: ++nextId };
    emit();
  });
}

function close(value: boolean | string | null) {
  const req = current;
  current = null;
  emit();
  req?.resolve(value);
}

export function confirmDialog(opts: { title: string; message?: string; confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return open(opts) as Promise<boolean>;
}

export function promptDialog(opts: { title: string; message?: string; value?: string; placeholder?: string; maxLength?: number; confirm?: string }): Promise<string | null> {
  return open({ ...opts, input: { value: opts.value ?? "", placeholder: opts.placeholder, maxLength: opts.maxLength } }) as Promise<string | null>;
}

function Box({ req }: { req: Request }) {
  const [value, setValue] = useState(req.input?.value ?? "");
  const ok = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const cancel = () => close(req.input ? null : false);
  const submit = () => close(req.input ? value.trim() || null : true);

  useEffect(() => {
    if (req.input) field.current?.select();
    else ok.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="jm-dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="w-full max-w-sm animate-[jm-pop_.16s_ease-out] rounded-3xl border border-line bg-panel p-6 shadow-2xl shadow-black/50"
      >
        <h2 id="jm-dialog-title" className="text-lg font-semibold leading-snug">
          {req.title}
        </h2>
        {req.message && <p className="mt-2 text-sm text-muted">{req.message}</p>}
        {req.input && (
          <input
            ref={field}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={req.input.placeholder}
            maxLength={req.input.maxLength}
            className="mt-4 w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={cancel} className="h-10 rounded-full border border-line px-5 text-sm font-medium hover:bg-foreground/[.05]">
            {req.cancel ?? "Cancel"}
          </button>
          <button
            ref={ok}
            type="submit"
            disabled={!!req.input && !value.trim()}
            className={`h-10 rounded-full px-5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              req.danger ? "bg-danger text-white hover:opacity-90" : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            {req.confirm ?? "OK"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Put once on the page (app/layout.tsx). */
export function DialogHost() {
  const req = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  if (!req) return null;
  return createPortal(<Box key={req.id} req={req} />, document.body);
}
