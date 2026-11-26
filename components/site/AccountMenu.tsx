"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { signInHref, useApp } from "@/components/AppProvider";
import type { AccountSummary } from "@/lib/types";

async function post(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function Row({ account, label }: { account: AccountSummary; label?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={account.name} src={account.picture} size={36} />
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium">{account.name}</span>
        <span className="block truncate text-xs text-muted">
          @{account.handle}
          {label ? ` · ${label}` : ""}
        </span>
      </span>
    </span>
  );
}

/**
 * The account switcher: the current account first, then every other Jace
 * account used on this device. Switching uses that account's saved sign-in.
 */
export function AccountMenu() {
  const { current, others, showNotice } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!current) {
    return (
      <a
        href={signInHref(pathname)}
        className="flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
      >
        <span className="hidden sm:inline">Sign in with Jace</span>
        <span className="sm:hidden">Sign in</span>
      </a>
    );
  }

  async function switchTo(account: AccountSummary) {
    setBusy(true);
    const data = await post("/api/accounts/switch", { sub: account.sub });
    if (data.reauth) {
      window.location.assign(signInHref(pathname, "add"));
      return;
    }
    setBusy(false);
    setOpen(false);
    if (data.banned) showNotice({ kind: "error", text: `@${account.handle} is banned on Jace, so it was removed from this device.` });
    else if (data.error) showNotice({ kind: "error", text: String(data.error) });
    else showNotice({ kind: "info", text: `Switched to @${account.handle}.` });
    router.refresh();
  }

  async function remove(account: AccountSummary) {
    setBusy(true);
    await post("/api/accounts/remove", { sub: account.sub });
    setBusy(false);
    showNotice({ kind: "info", text: `Removed @${account.handle} from this device.` });
    router.refresh();
  }

  async function signOut(all: boolean) {
    setBusy(true);
    await post(`/api/auth/signout${all ? "?all=1" : ""}`);
    setBusy(false);
    setOpen(false);
    showNotice({ kind: "info", text: all ? "Signed out of every account on this device." : `Signed out @${current!.handle}.` });
    router.refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`${current.name} (@${current.handle})`}
        className="flex items-center gap-2 rounded-full border border-line bg-panel p-1 text-sm font-medium transition-colors hover:bg-foreground/[.05] lg:pr-3"
      >
        <Avatar name={current.name} src={current.picture} size={28} />
        <span className="hidden max-w-32 truncate lg:inline">{current.name}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/40"
          aria-busy={busy}
        >
          <div className="border-b border-line p-3">
            <Row account={current} label="current" />
            <div className="mt-3 flex gap-2">
              <Link
                href={`/u/${encodeURIComponent(current.handle)}`}
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-line px-3 py-1.5 text-center text-sm hover:bg-foreground/[.05]"
              >
                Your profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-line px-3 py-1.5 text-center text-sm hover:bg-foreground/[.05]"
              >
                Edit profile
              </Link>
            </div>
          </div>
          {others.length > 0 && (
            <ul className="max-h-72 overflow-y-auto border-b border-line py-1">
              {others.map((account) => (
                <li key={account.sub} className="group flex items-center gap-1 px-2">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => switchTo(account)}
                    className="min-w-0 flex-1 rounded-xl p-1.5 hover:bg-foreground/[.05] disabled:opacity-60"
                  >
                    <Row account={account} />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(account)}
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger"
                    aria-label={`Remove @${account.handle} from this device`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col border-b border-line p-1.5 text-sm">
            {[
              ["/library", "Library and history"],
              ["/import", "Import from YouTube"],
              ["/services", "Choose services"],
              ["/feeds", "Your feeds"],
            ].map(([href, label]) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} role="menuitem" className="rounded-xl px-3 py-2 hover:bg-foreground/[.05]">
                {label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col p-1.5 text-sm">
            <a href={signInHref(pathname, "add")} role="menuitem" className="rounded-xl px-3 py-2 hover:bg-foreground/[.05]">
              + Add another Jace account
            </a>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => signOut(false)}
              className="rounded-xl px-3 py-2 text-left hover:bg-foreground/[.05]"
            >
              Sign out @{current.handle}
            </button>
            {others.length > 0 && (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => signOut(true)}
                className="rounded-xl px-3 py-2 text-left text-danger hover:bg-danger/10"
              >
                Sign out of all accounts
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
