import "server-only";
import { getExtensions } from "./prefs";
import type { VideoCard } from "./types";

/** Extras for YouTube videos from community projects, used by extensions. Never throw. */

const UA = { "User-Agent": "JaceMedia/0.1 (+https://github.com/okjace/jace-media)" };

/** Return YouTube Dislike: estimated likes and dislikes. */
export async function dislikes(id: string): Promise<{ likes: number; dislikes: number } | null> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  try {
    const res = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${id}`, {
      headers: UA,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { likes?: number; dislikes?: number };
    return typeof d.dislikes === "number" ? { likes: d.likes ?? 0, dislikes: d.dislikes } : null;
  } catch {
    return null;
  }
}

/** DeArrow: the community's best non-clickbait title for a video, or null to keep the original. */
async function dearrowTitle(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://sponsor.ajay.app/api/branding?videoID=${id}`, {
      headers: UA,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { titles?: { title: string; original: boolean; votes: number; locked: boolean }[] };
    const best = d.titles?.find((t) => !t.original && (t.locked || t.votes >= 0));
    // DeArrow marks words to keep as typed with ">"; plain text is what we show.
    return best ? best.title.replace(/(^|\s)>(\S)/g, "$1$2").trim() : null;
  } catch {
    return null;
  }
}

/** Applies DeArrow titles to YouTube videos when that extension is on. */
export async function withDeArrow(videos: VideoCard[]): Promise<VideoCard[]> {
  const ext = await getExtensions();
  if (!ext.dearrow) return videos;
  const titles = await Promise.all(videos.map((v) => (v.source === "youtube" ? dearrowTitle(v.id) : Promise.resolve(null))));
  return videos.map((v, i) => (titles[i] ? { ...v, title: titles[i]! } : v));
}
