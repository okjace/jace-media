"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_EXTENSIONS, type Extensions } from "@/lib/extensions";
import type { Service } from "@/lib/services";
import type { AccountSummary } from "@/lib/types";

type Notice = { kind: "error" | "info"; text: string; signIn?: boolean };

export type FeedTab = { id: string; name: string };
/** A video that keeps playing in the corner after you leave its page. */
export type MiniVideo = { source: "youtube" | "jace"; id: string; src?: string; poster?: string | null; title: string; start: number; href: string };
export type SidebarSub = { kind: string; ref: string; name: string; picture: string | null; folder: string | null };

type AppState = {
  current: AccountSummary | null;
  others: AccountSummary[];
  services: Service[];
  feeds: FeedTab[];
  extensions: Extensions;
  subs: SidebarSub[];
  /** The site has an Invidious server for private playback. */
  invidious: boolean;
  mini: MiniVideo | null;
  setMini: (v: MiniVideo | null) => void;
  notice: Notice | null;
  showNotice: (notice: Notice | null) => void;
};

const AppContext = createContext<AppState>({ current: null, others: [], services: [], feeds: [], extensions: DEFAULT_EXTENSIONS, subs: [], invidious: false, mini: null, setMini: () => {}, notice: null, showNotice: () => {} });

export function useApp(): AppState {
  return useContext(AppContext);
}

export function signInHref(next: string, mode?: "add" | "silent"): string {
  return `/api/auth/signin?next=${encodeURIComponent(next)}${mode ? `&mode=${mode}` : ""}`;
}

const ERRORS: Record<string, string> = {
  banned: "That Jace account is banned, so it can't use Jace Media.",
  denied: "Sign in with Jace was cancelled.",
  state: "That sign-in link expired. Try again.",
  signin: "Couldn't sign in with Jace. Try again.",
  setup: "Sign in with Jace isn't set up on this server yet (see the README).",
};

/**
 * The accounts on this device and the one-line notices under the header.
 * When nobody is signed in, it signs in with Jace silently once (the server
 * decides whether that's allowed: not right after a sign-out, and not again
 * after Jace said no). The current account is re-checked with Jace on each
 * page load, so a ban or a revoked token is noticed.
 */
export function AppProvider({
  current,
  others,
  services,
  feeds,
  extensions,
  subs,
  invidious = false,
  autoSignIn,
  children,
}: {
  current: AccountSummary | null;
  others: AccountSummary[];
  services: Service[];
  feeds: FeedTab[];
  extensions: Extensions;
  subs: SidebarSub[];
  invidious?: boolean;
  autoSignIn: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [notice, setNotice] = useState<Notice | null>(null);
  const showNotice = useCallback((n: Notice | null) => setNotice(n), []);
  const [mini, setMiniState] = useState<MiniVideo | null>(null);
  const setMini = useCallback((v: MiniVideo | null) => setMiniState(v), []);
  const checked = useRef<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("error");
    const added = url.searchParams.get("added");
    if (error || added || url.searchParams.has("signedin")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (error) setNotice({ kind: "error", text: ERRORS[error] ?? ERRORS.signin });
      else if (added) setNotice({ kind: "info", text: `Added @${added}. You're using it now.` });
      for (const key of ["error", "added", "signedin"]) url.searchParams.delete(key);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return;
    }
    if (autoSignIn) {
      window.location.replace(signInHref(url.pathname + url.search, "silent"));
    }
  }, [autoSignIn]);

  useEffect(() => {
    if (!current || checked.current === current.sub) return;
    checked.current = current.sub;
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { ok: boolean; banned?: boolean; expired?: boolean; current?: AccountSummary | null }) => {
        if (data.banned) {
          setNotice({ kind: "error", text: `@${current.handle} is banned on Jace, so it was removed from this device.` });
          router.refresh();
        } else if (data.expired) {
          setNotice({ kind: "info", text: `@${current.handle}'s Jace sign-in expired.`, signIn: true });
          router.refresh();
        } else if (data.current && (data.current.picture !== current.picture || data.current.name !== current.name)) {
          router.refresh();
        }
      })
      .catch(() => {});
  }, [current, router]);

  // A notice belongs to the page it was shown on.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setNotice(null);
    }
  }, [pathname]);

  return <AppContext.Provider value={{ current, others, services, feeds, extensions, subs, invidious, mini, setMini, notice, showNotice }}>{children}</AppContext.Provider>;
}

export function Notices() {
  const { notice, showNotice } = useApp();
  const pathname = usePathname();
  if (!notice) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <div
        role={notice.kind === "error" ? "alert" : "status"}
        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
          notice.kind === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-line bg-panel"
        }`}
      >
        <span>{notice.text}</span>
        <span className="flex shrink-0 items-center gap-2">
          {notice.signIn && (
            <a href={signInHref(pathname, "add")} className="rounded-full bg-accent px-3 py-1 font-medium text-on-accent hover:bg-accent-hover">
              Sign in again
            </a>
          )}
          <button
            type="button"
            onClick={() => showNotice(null)}
            aria-label="Dismiss"
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-foreground/[.08]"
          >
            ✕
          </button>
        </span>
      </div>
    </div>
  );
}
