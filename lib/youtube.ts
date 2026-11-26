import "server-only";
import type { VideoCard, YouTubeVideoDetail } from "./types";

/**
 * YouTube, read on the server. With YOUTUBE_API_KEY set, Jace Media uses the
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
/** Playlist ids: uploads (UU…), user playlists (PL…), and a few YouTube-made kinds. */
export const PLAYLIST_ID = /^(UU|PL|OL|FL|LL)[A-Za-z0-9_-]{10,40}$/;

/** Thumbnails go through Jace Media (app/api/yt-thumb), so browsing never contacts YouTube. */
export function thumbnailFor(id: string, size: "mqdefault" | "hqdefault" | "maxresdefault" = "hqdefault"): string {
  return `/api/yt-thumb/${id}${size === "hqdefault" ? "" : `?s=${size}`}`;
}

async function api<T>(path: string, params: Record<string, string>, revalidate = 600): Promise<T | null> {
  if (!KEY) return null;
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", KEY);
  try {
    const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(10_000) });
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
    liveBroadcastContent?: string;
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
        live: v.snippet.liveBroadcastContent === "live",
      };
    }
  }
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string; author_url?: string };
    const [channelId, page] = await Promise.all([data.author_url ? channelIdForUrl(data.author_url) : null, watchPageInfo(id)]);
    return {
      id,
      title: data.title ?? "YouTube video",
      description: page?.description ?? "",
      channelId: channelId ?? page?.channelId ?? null,
      channelName: data.author_name ?? "YouTube",
      publishedAt: page?.publishedAt ?? null,
      views: page?.views ?? null,
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

/**
 * A video's description, view count, and date from its public page (used when
 * there's no API key; cached for an hour).
 */
async function watchPageInfo(id: string): Promise<{ description: string; views: number | null; publishedAt: string | null; channelId: string | null } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: { "Accept-Language": "en", Cookie: "CONSENT=YES+1" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const str = (key: string) => {
      const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
      if (!m) return null;
      try {
        return JSON.parse(`"${m[1]}"`) as string;
      } catch {
        return null;
      }
    };
    const views = str("viewCount");
    const date = str("publishDate") ?? str("uploadDate");
    const channel = str("channelId");
    return {
      description: str("shortDescription") ?? "",
      views: views && /^\d+$/.test(views) ? Number(views) : null,
      publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null,
      channelId: channel && CHANNEL_ID.test(channel) ? channel : null,
    };
  } catch {
    return null;
  }
}

export type YouTubeComment = { id: string; author: string; authorPicture: string | null; text: string; likes: number; publishedAt: string; replies: number };

/** Top comments on a YouTube video (needs YOUTUBE_API_KEY; otherwise null). */
export async function youtubeComments(id: string, limit = 30): Promise<YouTubeComment[] | null> {
  if (!KEY || !VIDEO_ID.test(id)) return null;
  const data = await api<{
    items: {
      id: string;
      snippet: {
        totalReplyCount: number;
        topLevelComment: { snippet: { authorDisplayName: string; authorProfileImageUrl?: string; textOriginal: string; likeCount: number; publishedAt: string } };
      };
    }[];
  }>("commentThreads", { part: "snippet", videoId: id, order: "relevance", maxResults: String(Math.min(limit, 100)), textFormat: "plainText" });
  if (!data) return null;
  return data.items.map((c) => {
    const t = c.snippet.topLevelComment.snippet;
    return {
      id: c.id,
      author: t.authorDisplayName,
      authorPicture: t.authorProfileImageUrl ?? null,
      text: t.textOriginal,
      likes: t.likeCount,
      publishedAt: t.publishedAt,
      replies: c.snippet.totalReplyCount,
    };
  });
}

// ---------- Channels (with a YouTube API key) ----------

/** Channel pictures and banners load through Jace Media too (app/api/yt-image). */
export function ytImage(url: string | null | undefined): string | null {
  return url ? `/api/yt-image?u=${encodeURIComponent(url)}` : null;
}

export type ChannelInfo = {
  id: string;
  name: string;
  handle: string | null;
  description: string;
  picture: string | null;
  banner: string | null;
  subscribers: number | null;
  videoCount: number | null;
  uploads: string;
};

/** A channel's name, picture, banner, numbers, and its uploads playlist. */
export async function channelInfo(id: string): Promise<ChannelInfo | null> {
  if (!CHANNEL_ID.test(id)) return null;
  const data = await api<{
    items: {
      id: string;
      snippet: { title: string; description: string; customUrl?: string; thumbnails?: Record<string, { url: string }> };
      statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
      brandingSettings?: { image?: { bannerExternalUrl?: string } };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }[];
  }>("channels", { part: "snippet,statistics,brandingSettings,contentDetails", id });
  const c = data?.items?.[0];
  if (!c) return null;
  const t = c.snippet.thumbnails;
  const banner = c.brandingSettings?.image?.bannerExternalUrl;
  return {
    id: c.id,
    name: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    description: c.snippet.description,
    picture: ytImage(t?.high?.url ?? t?.medium?.url ?? t?.default?.url),
    banner: ytImage(banner ? `${banner}=w1600-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj` : null),
    subscribers: c.statistics?.hiddenSubscriberCount ? null : c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
    videoCount: c.statistics?.videoCount ? Number(c.statistics.videoCount) : null,
    // Every channel has an "uploads" playlist with all its public videos ("UU…").
    uploads: c.contentDetails?.relatedPlaylists?.uploads ?? `UU${id.slice(2)}`,
  };
}

/** One page (50) of a channel's uploads, newest first, and the token for the next page. */
export async function channelUploads(uploads: string, pageToken?: string): Promise<{ videos: VideoCard[]; next: string | null } | null> {
  if (!PLAYLIST_ID.test(uploads)) return null;
  const params: Record<string, string> = { part: "contentDetails", playlistId: uploads, maxResults: "50" };
  if (pageToken && /^[A-Za-z0-9_-]{1,100}$/.test(pageToken)) params.pageToken = pageToken;
  const page = await api<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>("playlistItems", params);
  if (!page) return null;
  const ids = page.items.map((i) => i.contentDetails.videoId);
  const byId = new Map((await videosById(ids)).map((v) => [v.id, v]));
  const videos = ids.map((id) => byId.get(id)).filter((v): v is ApiVideo => !!v).map(toCard);
  return { videos, next: page.nextPageToken ?? null };
}

export type ChannelResult = { id: string; name: string; description: string; picture: string | null };

/** YouTube channels matching a search. */
export async function searchChannels(q: string, limit = 12): Promise<ChannelResult[]> {
  const data = await api<{ items: { id: { channelId?: string }; snippet: { title: string; description: string; thumbnails?: Record<string, { url: string }> } }[] }>(
    "search",
    { part: "snippet", type: "channel", q, maxResults: String(Math.min(limit, 25)), safeSearch: "moderate" },
  );
  return (data?.items ?? [])
    .filter((i) => i.id.channelId)
    .map((i) => ({
      id: i.id.channelId!,
      name: i.snippet.title,
      description: i.snippet.description,
      picture: ytImage(i.snippet.thumbnails?.medium?.url ?? i.snippet.thumbnails?.default?.url),
    }));
}

/** Live streams matching a search. */
export async function searchLive(q: string, limit = 12): Promise<VideoCard[]> {
  const data = await api<{ items: { id: { videoId?: string }; snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string } }[] }>(
    "search",
    { part: "snippet", type: "video", eventType: "live", q, maxResults: String(Math.min(limit, 25)), safeSearch: "moderate" },
  );
  return (data?.items ?? [])
    .filter((i) => i.id.videoId)
    .map((i) => ({
      source: "youtube",
      id: i.id.videoId!,
      title: decode(i.snippet.title),
      thumbnail: thumbnailFor(i.id.videoId!),
      channelId: i.snippet.channelId,
      channelName: i.snippet.channelTitle,
      publishedAt: i.snippet.publishedAt,
      duration: "PT0S",
    }));
}

/** Channel pictures for up to 50 channels at once (one cheap request). */
export async function channelPictures(ids: string[]): Promise<Map<string, string>> {
  const valid = ids.filter((id) => CHANNEL_ID.test(id)).slice(0, 50);
  if (!valid.length) return new Map();
  const data = await api<{ items: { id: string; snippet: { thumbnails?: Record<string, { url: string }> } }[] }>("channels", {
    part: "snippet",
    id: valid.join(","),
  });
  const out = new Map<string, string>();
  for (const c of data?.items ?? []) {
    const url = ytImage(c.snippet.thumbnails?.medium?.url ?? c.snippet.thumbnails?.default?.url);
    if (url) out.set(c.id, url);
  }
  return out;
}

export type PlaylistResult = { id: string; title: string; channelId: string; channelName: string; thumbnail: string | null; count: number | null };

/** YouTube playlists matching a search. */
export async function searchPlaylists(q: string, limit = 12): Promise<PlaylistResult[]> {
  const data = await api<{
    items: { id: { playlistId?: string }; snippet: { title: string; channelId: string; channelTitle: string; thumbnails?: Record<string, { url: string }> } }[];
  }>("search", { part: "snippet", type: "playlist", q, maxResults: String(Math.min(limit, 25)), safeSearch: "moderate" });
  return (data?.items ?? [])
    .filter((i) => i.id.playlistId)
    .map((i) => ({
      id: i.id.playlistId!,
      title: decode(i.snippet.title),
      channelId: i.snippet.channelId,
      channelName: i.snippet.channelTitle,
      thumbnail: ytImage(i.snippet.thumbnails?.high?.url ?? i.snippet.thumbnails?.medium?.url),
      count: null,
    }));
}

/** A playlist's title and channel. */
export async function playlistInfo(id: string): Promise<{ title: string; channelId: string; channelName: string; description: string; count: number } | null> {
  if (!PLAYLIST_ID.test(id)) return null;
  const data = await api<{ items: { snippet: { title: string; channelId: string; channelTitle: string; description: string }; contentDetails?: { itemCount?: number } }[] }>(
    "playlists",
    { part: "snippet,contentDetails", id },
  );
  const p = data?.items?.[0];
  return p ? { title: p.snippet.title, channelId: p.snippet.channelId, channelName: p.snippet.channelTitle, description: p.snippet.description, count: p.contentDetails?.itemCount ?? 0 } : null;
}

/** Short videos matching a search (YouTube's search can't ask for Shorts exactly, so: under 4 minutes, tagged #shorts). */
export async function searchShorts(q: string, limit = 18): Promise<VideoCard[]> {
  const data = await api<{ items: { id: { videoId?: string } }[] }>("search", {
    part: "id",
    type: "video",
    q: `${q} #shorts`,
    videoDuration: "short",
    maxResults: String(Math.min(limit, 50)),
    safeSearch: "moderate",
  });
  const ids = (data?.items ?? []).map((i) => i.id.videoId).filter((x): x is string => !!x);
  const byId = new Map((await videosById(ids)).map((v) => [v.id, v]));
  return ids
    .map((id) => byId.get(id))
    .filter((v): v is ApiVideo => !!v)
    .map(toCard)
    .filter((v) => isShortDuration(v.duration ?? undefined) || /#shorts?/i.test(v.title))
    .map((v) => ({ ...v, short: true }));
}

// ---------- Channel tabs: live, playlists, community posts ----------

type SearchItem = { id: { videoId?: string }; snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string; liveBroadcastContent?: string } };

function searchToCards(items: SearchItem[] | undefined): VideoCard[] {
  return (items ?? [])
    .filter((i) => i.id.videoId)
    .map((i) => ({
      source: "youtube" as const,
      id: i.id.videoId!,
      title: decode(i.snippet.title),
      thumbnail: thumbnailFor(i.id.videoId!),
      channelId: i.snippet.channelId,
      channelName: i.snippet.channelTitle,
      publishedAt: i.snippet.publishedAt,
    }));
}

/** A channel's stream that's live right now, if any (checked every 5 minutes). */
export async function channelLiveNow(channelId: string): Promise<VideoCard | null> {
  if (!CHANNEL_ID.test(channelId)) return null;
  const data = await api<{ items: SearchItem[] }>("search", { part: "snippet", channelId, eventType: "live", type: "video", maxResults: "1" }, 300);
  const [card] = searchToCards(data?.items);
  return card ? { ...card, duration: "PT0S" } : null;
}

/** A channel's live streams: on now, coming up, and past ones. */
export async function channelStreams(channelId: string): Promise<{ live: VideoCard[]; upcoming: VideoCard[]; past: VideoCard[] }> {
  if (!CHANNEL_ID.test(channelId)) return { live: [], upcoming: [], past: [] };
  const get = (eventType: string, max: number, revalidate: number) =>
    api<{ items: SearchItem[] }>("search", { part: "snippet", channelId, eventType, type: "video", order: "date", maxResults: String(max) }, revalidate).then((d) =>
      searchToCards(d?.items),
    );
  const [live, upcoming, past] = await Promise.all([get("live", 5, 300), get("upcoming", 10, 1800), get("completed", 30, 3600)]);
  return { live: live.map((v) => ({ ...v, duration: "PT0S" })), upcoming, past };
}

/** A channel's playlists. */
export async function channelPlaylists(channelId: string): Promise<PlaylistResult[]> {
  if (!CHANNEL_ID.test(channelId)) return [];
  const data = await api<{
    items: { id: string; snippet: { title: string; channelId: string; channelTitle: string; thumbnails?: Record<string, { url: string }> }; contentDetails?: { itemCount?: number } }[];
  }>("playlists", { part: "snippet,contentDetails", channelId, maxResults: "50" }, 3600);
  return (data?.items ?? []).map((p) => {
    const t = p.snippet.thumbnails;
    const thumb = t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? null;
    const vid = thumb?.match(/\/vi\/([\w-]{11})\//)?.[1];
    return {
      id: p.id,
      title: decode(p.snippet.title),
      channelId: p.snippet.channelId,
      channelName: p.snippet.channelTitle,
      thumbnail: vid ? thumbnailFor(vid, "mqdefault") : null,
      count: p.contentDetails?.itemCount ?? null,
    };
  });
}

/** Live numbers for a stream: people watching and when it started (refreshed every 30 seconds). */
export async function liveDetails(id: string): Promise<{ viewers: number | null; startedAt: string | null; scheduledFor: string | null; chatId: string | null } | null> {
  if (!VIDEO_ID.test(id)) return null;
  const data = await api<{
    items: { liveStreamingDetails?: { concurrentViewers?: string; actualStartTime?: string; scheduledStartTime?: string; activeLiveChatId?: string } }[];
  }>("videos", { part: "liveStreamingDetails", id }, 30);
  const d = data?.items?.[0]?.liveStreamingDetails;
  if (!d) return null;
  return {
    viewers: d.concurrentViewers ? Number(d.concurrentViewers) : null,
    startedAt: d.actualStartTime ?? null,
    scheduledFor: d.scheduledStartTime ?? null,
    chatId: d.activeLiveChatId ?? null,
  };
}

export type CommunityPost = {
  id: string;
  text: string;
  publishedText: string;
  likes: string | null;
  images: string[];
  videoId: string | null;
  poll: string[] | null;
};

/**
 * A channel's community posts. YouTube's API doesn't offer them, so Jace
 * Media's server reads the channel's Posts page (your browser never contacts
 * YouTube). Best effort: if YouTube changes the page, this shows nothing.
 */
export async function channelCommunity(channelId: string): Promise<CommunityPost[]> {
  if (!CHANNEL_ID.test(channelId)) return [];
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/posts?hl=en`, {
      headers: { "Accept-Language": "en", Cookie: "CONSENT=YES+1", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36" },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!m) return [];
    const data = JSON.parse(m[1]) as unknown;
    const posts: CommunityPost[] = [];
    const runs = (r: unknown) =>
      Array.isArray((r as { runs?: unknown[] })?.runs) ? ((r as { runs: { text?: string }[] }).runs.map((x) => x.text ?? "").join("")) : ((r as { simpleText?: string })?.simpleText ?? "");
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object" || posts.length >= 30) return;
      if (Array.isArray(node)) return node.forEach(walk);
      const obj = node as Record<string, unknown>;
      const post = obj.backstagePostRenderer as Record<string, unknown> | undefined;
      if (post) {
        const attachment = (post.backstageAttachment ?? {}) as Record<string, unknown>;
        const imgs: string[] = [];
        const addImage = (img: unknown) => {
          const thumbs = (img as { image?: { thumbnails?: { url: string }[] } })?.image?.thumbnails;
          const url = thumbs?.[thumbs.length - 1]?.url;
          if (url) imgs.push(`/api/yt-image?u=${encodeURIComponent(url.startsWith("//") ? `https:${url}` : url)}`);
        };
        if (attachment.backstageImageRenderer) addImage(attachment.backstageImageRenderer);
        const multi = (attachment.postMultiImageRenderer as { images?: { backstageImageRenderer?: unknown }[] })?.images;
        multi?.forEach((i) => addImage(i.backstageImageRenderer));
        const video = (attachment.videoRenderer as { videoId?: string })?.videoId ?? null;
        const pollChoices = (attachment.pollRenderer as { choices?: { text?: unknown }[] })?.choices?.map((c) => runs(c.text)) ?? null;
        posts.push({
          id: String(post.postId ?? posts.length),
          text: runs(post.contentText),
          publishedText: runs(post.publishedTimeText),
          likes: runs(post.voteCount) || null,
          images: imgs,
          videoId: video && VIDEO_ID.test(video) ? video : null,
          poll: pollChoices,
        });
        return;
      }
      for (const v of Object.values(obj)) walk(v);
    };
    walk(data);
    return posts;
  } catch {
    return [];
  }
}
