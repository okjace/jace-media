import "server-only";
import { getVideo, listVideos } from "./jace";
import { jaceCard } from "./format";
import { getCurrent } from "./session";
import { channelFeed } from "./youtube";
import type { JaceVideoDetail, VideoCard } from "./types";

/**
 * Jace videos for a page: as the signed-in person when there is one, falling
 * back to Jace Media's own client credentials. Never throws.
 */
async function asViewer<T>(fn: (token: string | null) => Promise<T>): Promise<T> {
  const current = await getCurrent();
  if (current) {
    try {
      return await fn(current.token);
    } catch {
      // A stale token can still read public videos as the app.
    }
  }
  return fn(null);
}

export async function jaceVideos(opts: { q?: string; limit?: number } = {}): Promise<{ videos: VideoCard[]; available: boolean }> {
  try {
    const page = await asViewer((token) => listVideos(token, opts));
    return { videos: page.videos.filter((v) => v.visibility === "public").map(jaceCard), available: true };
  } catch (err) {
    console.error("Couldn't load Jace videos:", err instanceof Error ? err.message : err);
    return { videos: [], available: false };
  }
}

export async function jaceVideo(id: string): Promise<JaceVideoDetail | null> {
  try {
    return await asViewer((token) => getVideo(token, id));
  } catch (err) {
    console.error("Couldn't load a Jace video:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Popular YouTube channels whose newest uploads fill the Videos tab when
 * there's no YouTube API key (their RSS feeds need no key). Change them with
 * YOUTUBE_CHANNELS (comma-separated channel ids).
 */
const DEFAULT_CHANNELS = [
  "UCX6OQ3DkcsbYNE6H8uQQuVA", // MrBeast
  "UCBJycsmduvYEL83R_U4JriQ", // Marques Brownlee
  "UCHnyfMqiRRG1u-2MsSQLbXA", // Veritasium
  "UCsXVk37bltHxD1rDPwtNM8Q", // Kurzgesagt
  "UCY1kMZp36IQSyNx_9h4mpCg", // Mark Rober
  "UCLA_DiR1FfKNvjuUpBHmylQ", // NASA
  "UCXuqSBlHAE6Xw-yeJA0Tunw", // Linus Tech Tips
  "UCBa659QWEk1AI4Tg--mrJ2A", // Tom Scott
];

export async function featuredYouTube(limit = 32): Promise<VideoCard[]> {
  const ids = process.env.YOUTUBE_CHANNELS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_CHANNELS;
  const feeds = await Promise.all(ids.map(channelFeed));
  // A few from each channel, newest first, so one channel never fills the page.
  return feeds
    .flatMap((f) => (f?.videos ?? []).filter((v) => !/#shorts/i.test(v.title)).slice(0, 4))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, limit);
}

/** Alternates lists (a, b, c, a, b, c, …) so a mixed feed shows every source near the top. */
export function interleave<T>(...lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const list of lists) if (i < list.length) out.push(list[i]);
  return out;
}
