import type { VideoCard } from "@/lib/types";

export function SourceBadge({ source }: { source: VideoCard["source"] }) {
  return source === "jace" ? (
    <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-accent">Jace</span>
  ) : (
    <span className="rounded-md bg-yt px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">YouTube</span>
  );
}
