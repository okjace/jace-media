"use client";

import { useApp } from "@/components/AppProvider";
import { VideoPlayer } from "./VideoPlayer";

/** The video you left while it was playing, still playing in the corner. */
export function MiniPlayer() {
  const { mini, setMini } = useApp();
  if (!mini) return null;
  return (
    <div className="fixed bottom-20 right-3 z-50 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-xl shadow-2xl shadow-black/50 ring-1 ring-line md:bottom-4 md:right-4">
      <VideoPlayer
        key={`${mini.source}:${mini.id}`}
        source={mini.source}
        id={mini.id}
        src={mini.src}
        poster={mini.poster}
        title={mini.title}
        variant="mini"
        active
        autoStart
        startAt={mini.start}
        href={mini.href}
        onClose={() => setMini(null)}
      />
      <p className="truncate bg-panel px-3 py-2 text-sm font-medium">{mini.title}</p>
    </div>
  );
}
