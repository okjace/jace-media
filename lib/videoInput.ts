import type { VideoCard } from "./types";

/** Checks a video sent by the browser (to save it to a playlist). */
export function parseVideo(v: unknown): VideoCard | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if ((r.source !== "youtube" && r.source !== "jace") || typeof r.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(r.id)) return null;
  const thumb = typeof r.thumbnail === "string" && /^(\/api\/yt-thumb\/|https:\/\/)/.test(r.thumbnail) ? r.thumbnail : null;
  return {
    source: r.source,
    id: r.id,
    title: typeof r.title === "string" ? r.title.slice(0, 200) : "Video",
    thumbnail: thumb ?? (r.source === "youtube" ? `/api/yt-thumb/${r.id}` : null),
    channelId: typeof r.channelId === "string" ? r.channelId.slice(0, 64) : "",
    channelName: typeof r.channelName === "string" ? r.channelName.slice(0, 120) : "",
    publishedAt: null,
    short: r.short === true,
  };
}
