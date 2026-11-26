import "server-only";
import type { VideoCard } from "./types";

/**
 * Live: games happening now on Jace Live, Twitch streams (with
 * TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET), and YouTube live streams (with
 * YOUTUBE_API_KEY). Every source is optional and never throws.
 */

export const JACE_LIVE_URL = (process.env.JACE_LIVE_URL || "https://jace-live.vercel.app").replace(/\/$/, "");

async function getJson<T>(url: string, init?: RequestInit & { next?: { revalidate: number } }): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------- Jace Live ----------

export type JaceLiveGame = { code: string; mode: string; setTitle: string | null; hostName: string; status: string; players: number };
export type JaceLiveSet = { id: string; title: string; cover: string; owner_name: string; plays: number; questionCount: number; verified: boolean; tags: string[] };

/** Games their hosts made public that anyone can join right now. */
export async function jaceLiveGames(): Promise<JaceLiveGame[] | null> {
  const data = await getJson<{ games: JaceLiveGame[] }>(`${JACE_LIVE_URL}/api/live/public`, { cache: "no-store" });
  return data?.games ?? null;
}

/** Popular question sets to host (or ones matching a search). */
export async function jaceLiveSets(q?: string): Promise<JaceLiveSet[]> {
  const search = q ? `&q=${encodeURIComponent(q.slice(0, 60))}` : "";
  const data = await getJson<{ sets: JaceLiveSet[] }>(`${JACE_LIVE_URL}/api/live/discover?sort=popular${search}`, { next: { revalidate: 600 } });
  return (data?.sets ?? []).slice(0, 12);
}

export const jaceLiveJoinUrl = (code: string) => `${JACE_LIVE_URL}/live/play/${encodeURIComponent(code)}`;
export const jaceLiveHostUrl = (setId: string) => `${JACE_LIVE_URL}/live/host/new?set=${encodeURIComponent(setId)}`;

// ---------- Twitch ----------

export const hasTwitch = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

export type TwitchStream = {
  login: string;
  name: string;
  title: string;
  game: string;
  viewers: number;
  thumbnail: string;
  mature: boolean;
  startedAt: string;
};

let twitchToken: { value: string; expires: number } | null = null;

async function twitchAuth(): Promise<string | null> {
  if (!hasTwitch) return null;
  if (twitchToken && twitchToken.expires > Date.now() + 60_000) return twitchToken.value;
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: "client_credentials",
  });
  const data = await getJson<{ access_token: string; expires_in: number }>("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body,
    cache: "no-store",
  });
  if (!data?.access_token) return null;
  twitchToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return twitchToken.value;
}

type HelixStream = { user_login: string; user_name: string; title: string; game_name: string; viewer_count: number; thumbnail_url: string; is_mature: boolean; started_at: string };

const toStream = (s: HelixStream): TwitchStream => ({
  login: s.user_login,
  name: s.user_name,
  title: s.title,
  game: s.game_name,
  viewers: s.viewer_count,
  thumbnail: s.thumbnail_url.replace("{width}", "640").replace("{height}", "360"),
  mature: s.is_mature,
  startedAt: s.started_at,
});

async function helix<T>(path: string): Promise<T | null> {
  const token = await twitchAuth();
  if (!token) return null;
  return getJson<T>(`https://api.twitch.tv/helix/${path}`, {
    headers: { "Client-Id": process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${token}` },
    next: { revalidate: 120 },
  });
}

/** The most-watched live streams right now. */
export async function twitchStreams(limit = 24): Promise<TwitchStream[] | null> {
  const data = await helix<{ data: HelixStream[] }>(`streams?first=${Math.min(limit, 100)}`);
  return data ? data.data.map(toStream) : null;
}

export async function twitchStream(login: string): Promise<TwitchStream | null> {
  if (!/^[a-zA-Z0-9_]{2,25}$/.test(login)) return null;
  const data = await helix<{ data: HelixStream[] }>(`streams?user_login=${login}`);
  return data?.data[0] ? toStream(data.data[0]) : null;
}

// ---------- YouTube live ----------

/** Popular YouTube live streams (needs YOUTUBE_API_KEY). */
export async function youtubeLive(limit = 12): Promise<VideoCard[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  for (const [k, v] of Object.entries({ part: "snippet", type: "video", eventType: "live", order: "viewCount", maxResults: String(limit), safeSearch: "moderate", key })) {
    url.searchParams.set(k, v);
  }
  const data = await getJson<{ items: { id: { videoId: string }; snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string } }[] }>(url.toString(), {
    next: { revalidate: 300 },
  });
  return (data?.items ?? []).map((i) => ({
    source: "youtube",
    id: i.id.videoId,
    title: i.snippet.title,
    thumbnail: `/api/yt-thumb/${i.id.videoId}`,
    channelId: i.snippet.channelId,
    channelName: i.snippet.channelTitle,
    publishedAt: i.snippet.publishedAt,
    duration: "PT0S",
  }));
}
