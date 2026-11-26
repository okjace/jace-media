import "server-only";
import type { VideoCard, YouTubeVideoDetail } from "./types";

/**
 * YouTube, read on the server. With YOUTUBE_API_KEY set, JaceTube uses the
 * YouTube Data API for trending videos, search, and view counts. Without one
 * it still works from YouTube's public pieces that need no key: channel RSS
 * feeds (a channel's latest 15 uploads, used for subscriptions) and oEmbed
 * (a video's title and channel). Videos always play in YouTube's own
 * embedded player.
 */

const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY;
const REGION = process.env.YOUTUBE_REGION || "US";

export const hasYouTubeApi = !!KEY;

/** YouTube ids: 11 characters for videos, "UC" + 22 for channels. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/** Thumbnails go through Jace Media (app/api/yt-thumb), so browsing never contacts YouTube. */
export function thumbnailFor(id: string, size: "mqdefault" | "hqdefault" | "maxresdefault" = "hqdefault"): string {
  return `/api/yt-thumb/${id}${size === "hqdefault" ? "" : `?s=${size}`}`;
}

async function api<T>(path: string, params: Record<string, string>): Promise<T | null> {
  if (!KEY) return null;
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", KEY);
  try {
    const res = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`YouTube API ${path} answered ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type ApiVideo = {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: Record<string, { url: string }>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string };
};

/** Videos of a minute or less from the API are treated as Shorts. */
function isShortDuration(iso: string | undefined): boolean {
  const m = iso?.match(/^PT(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return false;
  const seconds = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return seconds > 0 && seconds <= 60;
}

function bestThumb(_thumbs: unknown, id: string): string {
  return thumbnailFor(id);
}

function toCard(v: ApiVideo): VideoCard {
  return {
    source: "youtube",
    id: v.id,
    title: v.snippet.title,
    thumbnail: bestThumb(v.snippet.thumbnails, v.id),
    channelId: v.snippet.channelId,
    channelName: v.snippet.channelTitle,
    publishedAt: v.snippet.publishedAt,
    views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
    duration: v.contentDetails?.duration ?? null,
    short: isShortDuration(v.contentDetails?.duration),
  };
}

async function videosById(ids: string[]): Promise<ApiVideo[]> {
  if (ids.length === 0) return [];
  const data = await api<{ items: ApiVideo[] }>("videos", {
    part: "snippet,contentDetails,statistics",
    id: ids.slice(0, 50).join(","),
  });
  return data?.items ?? [];
}

/** Most popular videos right now (needs an API key; otherwise empty). */
export async function trending(limit = 24): Promise<VideoCard[]> {
  const data = await api<{ items: ApiVideo[] }>("videos", {
    part: "snippet,contentDetails,statistics",
    chart: "mostPopular",
    regionCode: REGION,
    maxResults: String(Math.min(limit, 50)),
  });
  return (data?.items ?? []).map(toCard);
}

/** YouTube search (needs an API key; otherwise null, meaning "not available"). */
export async function search(q: string, limit = 20): Promise<VideoCard[] | null> {
  if (!KEY) return null;
  const data = await api<{ items: { id: { videoId?: string } }[] }>("search", {
    part: "id",
    type: "video",
    q,
    maxResults: String(Math.min(limit, 50)),
    safeSearch: "moderate",
  });
  const ids = (data?.items ?? []).map((i) => i.id.videoId).filter((id): id is string => !!id);
  const byId = new Map((await videosById(ids)).map((v) => [v.id, v]));
  return ids.map((id) => byId.get(id)).filter((v): v is ApiVideo => !!v).map(toCard);
}

/** A video's details: from the API when there's a key, otherwise oEmbed. */
export async function videoDetail(id: string): Promise<YouTubeVideoDetail | null> {
  if (!VIDEO_ID.test(id)) return null;
  if (KEY) {
    const [v] = await videosById([id]);
    if (v) {
      return {
        id,
        title: v.snippet.title,
        description: v.snippet.description,
        channelId: v.snippet.channelId,
        channelName: v.snippet.channelTitle,
        publishedAt: v.snippet.publishedAt,
        views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
        likes: v.statistics?.likeCount ? Number(v.statistics.likeCount) : null,
      };
    }
  }
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string; author_url?: string };
    return {
      id,
      title: data.title ?? "YouTube video",
      description: "",
      channelId: data.author_url ? await channelIdForUrl(data.author_url) : null,
      channelName: data.author_name ?? "YouTube",
      publishedAt: null,
      views: null,
      likes: null,
    };
  } catch {
    return null;
  }
}

/**
 * oEmbed gives a channel's handle URL (youtube.com/@name), not its id; the
 * channel page's canonical link has the id. Best effort, cached for a day.
 */
async function channelIdForUrl(authorUrl: string): Promise<string | null> {
  const direct = authorUrl.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1];
  if (direct) return direct;
  if (!/^https:\/\/www\.youtube\.com\/@[^/?#]+$/.test(authorUrl)) return null;
  try {
    const res = await fetch(authorUrl, {
      headers: { "Accept-Language": "en", Cookie: "CONSENT=YES+1" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const id =
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
      html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/)?.[1];
    return id ?? null;
  } catch {
    return null;
  }
}

// ---------- Channel RSS (no key needed) ----------

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1].trim()) : null;
}

export type ChannelFeed = { channelId: string; name: string; videos: VideoCard[] };

/** A channel's latest uploads from its public RSS feed. */
export async function channelFeed(channelId: string): Promise<ChannelFeed | null> {
  if (!CHANNEL_ID.test(channelId)) return null;
  let xml: string;
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    xml = await res.text();
  } catch {
    return null;
  }
  const head = xml.split("<entry>")[0];
  const name = tag(tag(head, "author") ?? "", "name") ?? tag(head, "title") ?? "YouTube channel";
  const videos: VideoCard[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const id = tag(entry, "yt:videoId");
    if (!id) continue;
    const views = entry.match(/<media:statistics views="(\d+)"/);
    videos.push({
      source: "youtube",
      id,
      title: tag(entry, "title") ?? "",
      thumbnail: thumbnailFor(id),
      channelId,
      channelName: name,
      publishedAt: tag(entry, "published"),
      views: views ? Number(views[1]) : null,
      // A channel's feed links Shorts as youtube.com/shorts/<id>.
      short: entry.includes(`youtube.com/shorts/${id}`),
    });
  }
  return { channelId, name, videos };
}

/** Newest uploads across many channels (a subscriptions feed). */
export async function subscriptionsFeed(channelIds: string[], limit = 48): Promise<VideoCard[]> {
  const feeds = await Promise.all(channelIds.filter((id) => CHANNEL_ID.test(id)).slice(0, 60).map(channelFeed));
  return feeds
    .flatMap((f) => f?.videos ?? [])
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, limit);
}

/** Pulls a video id out of anything that looks like a YouTube link (or a bare id). */
export function parseYouTubeVideo(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return null; // a bare 11-char word is more likely a search
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    const host = url.hostname.replace(/^(www|m|music)\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1, 12);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?]+)/)?.[1] ?? null;
    }
    return id && VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
