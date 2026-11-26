"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { LiveAvatar } from "@/components/live/LiveAvatar";

/** Who's live on Jace Media right now (their Jace id → stream id), checked every minute. */
const LiveHostsContext = createContext<Map<string, string>>(new Map());

export function LiveHostsProvider({ children }: { children: ReactNode }) {
  const [hosts, setHosts] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/live");
        const data = (await res.json()) as { streams?: { id: string; hostSub: string }[] };
        if (!stop) setHosts(new Map((data.streams ?? []).map((s) => [s.hostSub, s.id])));
      } catch {}
    };
    void load();
    const t = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return <LiveHostsContext.Provider value={hosts}>{children}</LiveHostsContext.Provider>;
}

/** The stream someone is live in right now, or null. */
export function useLiveStream(sub: string | null | undefined): string | null {
  const hosts = useContext(LiveHostsContext);
  return sub ? (hosts.get(sub) ?? null) : null;
}

/** A Jace person's picture, with the LIVE ring while they're streaming. link: tap the picture to watch. */
export function UserAvatar({ sub, name, src, size = 40, link = false }: { sub?: string | null; name: string; src?: string | null; size?: number; link?: boolean }) {
  const stream = useLiveStream(sub);
  if (!stream) return <Avatar name={name} src={src} size={size} />;
  return <LiveAvatar name={name} src={src} size={size} href={link ? `/live/watch/${stream}` : undefined} />;
}
