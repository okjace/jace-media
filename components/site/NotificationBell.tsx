"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";

/** The bell in the header, with how many notifications are unread (checked once a minute). */
export function NotificationBell() {
  const { current } = useApp();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!current) return;
    let stop = false;
    const check = () =>
      fetch("/api/notifications?count=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((d: { unread: number }) => !stop && setUnread(d.unread))
        .catch(() => {});
    check();
    const t = setInterval(() => document.visibilityState === "visible" && check(), 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [current, pathname]);

  if (!current) return null;
  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-foreground/[.07]"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
