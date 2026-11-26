"use client";

import { useEffect } from "react";
import { useApp } from "@/components/AppProvider";

/** Adds the video to watch history (after a few seconds on the page), which drives recommendations. */
export function RecordWatch(props: { source: "youtube" | "jace"; id: string; title: string; channelId: string | null; channelName: string | null }) {
  const { current } = useApp();
  const { source, id, title, channelId, channelName } = props;
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, id, title, channelId, channelName }),
      }).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [current, source, id, title, channelId, channelName]);
  return null;
}
