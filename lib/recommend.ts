import "server-only";
import { cache } from "react";
import { getViewer } from "./auth";
import { featuredYouTube, jaceVideos } from "./data";
import { q } from "./db";
import { followKey } from "./follow";
import type { Extensions } from "./extensions";
import { getExtensions, getServices } from "./prefs";
import type { Service } from "./services";
import type { FeedItem, VideoCard } from "./types";
import { channelFeed, hasYouTubeApi, search, trending } from "./youtube";

/**
 * Recommendations, used on every tab. YouTube doesn't let anyone else see its
 * own recommendations, so Jace Media works them out the same way from the
 * same signals: the channels you watch most (your imported YouTube history
 * counts, and so does everything you watch here), your subscriptions and
 * likes, how new and how popular a video is, and what you said you're not
 * interested in. A little daily randomness keeps it from going stale.
 */

export type Taste = {
  signedIn: boolean;
  services: Service[];
  ext: Extensions;
  /** 0..1 per channel ("youtube:UC…" or "jace:<owner id>"), from watch history and likes. */
  channels: Map<string, number>;
  /** followKey()s of everything followed: "youtube:uc…", "jace:<sub>", "bluesky:<handle>", … */
  following: Set<string>;
  watched: Map<string, number>;
  hiddenVideos: Set<string>;
  hiddenChannels: Set<string>;
  /** Jace authors whose posts you liked. */
  likedAuthors: Map<string, number>;
  /** Words from what you watched lately. */
  keywords: string[];
  seed: string;
};

const STOP = new Set(
  "the and for with this that from your you are was what how why when who our out not but all can get new vs official video videos full episode part live best ever most into have has will just about more make made over than then they them their there here".split(
    " ",
  ),
);

function keywordsFrom(titles: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const words = new Set(t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/));
    for (const w of words) if (w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

/** Everything known about what this person likes. Cached for one request. */
export const getTaste = cache(async (): Promise<Taste> => {
  const [viewer, services, ext] = await Promise.all([getViewer(), getServices(), getExtensions()]);
  const day = new Date().toISOString().slice(0, 10);
  const taste: Taste = {
    signedIn: !!viewer,
    services,
    ext,
    channels: new Map(),
    following: new Set(),
    watched: new Map(),
    hiddenVideos: new Set(),
    hiddenChannels: new Set(),
    likedAuthors: new Map(),
    keywords: [],
    seed: `${viewer?.sub ?? "guest"}:${day}`,
  };
  if (!viewer) return taste;

  try {
    const now = Date.now();
    const [channels, liked, subs, recent, hidden, authors] = await Promise.all([
      // Watches count less as they get older (a 90-day half life).
      q(
        `SELECT source, channel_id, sum(watch_count * power(0.5, ($2 - watched_at) / 7776000000.0))::float AS w
         FROM watch_history WHERE sub = $1 AND channel_id IS NOT NULL GROUP BY source, channel_id ORDER BY w DESC LIMIT 300`,
        [viewer.sub, now],
      ),
      q(`SELECT source, channel_id, count(*)::int AS n FROM video_likes WHERE sub = $1 AND channel_id IS NOT NULL GROUP BY 1, 2`, [viewer.sub]),
      q(`SELECT kind, ref FROM subscriptions WHERE sub = $1`, [viewer.sub]),
      q(`SELECT source, video_id, title, watch_count FROM watch_history WHERE sub = $1 ORDER BY watched_at DESC LIMIT 3000`, [viewer.sub]),
      q(`SELECT kind, ref FROM hidden WHERE sub = $1`, [viewer.sub]),
      q(
        `SELECT p.author_sub, count(*)::int AS n FROM likes l JOIN posts p ON p.id = l.post_id
         WHERE l.sub = $1 AND p.author_sub <> $1 GROUP BY 1 ORDER BY n DESC LIMIT 100`,
        [viewer.sub],
      ),
    ]);
    const raw = new Map<string, number>();
    for (const r of channels) raw.set(`${r.source}:${r.channel_id}`, Number(r.w));
    for (const r of liked) {
      const key = `${r.source}:${r.channel_id}`;
      raw.set(key, (raw.get(key) ?? 0) + Number(r.n) * 2);
    }
    // Square-root scaling so one binge-watched channel doesn't drown out the rest.
    const max = Math.max(1, ...[...raw.values()].map(Math.sqrt));
    for (const [k, w] of raw) taste.channels.set(k, Math.sqrt(w) / max);
    for (const r of subs) taste.following.add(followKey({ kind: r.kind as string, ref: r.ref as string }));
    for (const r of recent) taste.watched.set(`${r.source}:${r.video_id}`, Number(r.watch_count));
    for (const r of hidden) (r.kind === "video" ? taste.hiddenVideos : taste.hiddenChannels).add(r.ref as string);
    for (const r of authors) taste.likedAuthors.set(r.author_sub as string, Number(r.n));
    taste.keywords = keywordsFrom(recent.slice(0, 150).map((r) => r.title as string));
  } catch (err) {
    console.error("Couldn't read taste:", err instanceof Error ? err.message : err);
  }
  return taste;
});

/** A stable 0..1 number per (seed, id): the same order all day, a fresh mix tomorrow. */
function jitter(seed: string, id: string): number {
  let h = 2166136261;
  for (const c of `${seed}|${id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const ageDays = (iso: string | null | undefined) => (iso ? Math.max(0, (Date.now() - Date.parse(iso)) / 86_400_000) : 30);

function channelKey(v: VideoCard): string {
  return `${v.source}:${v.channelId}`;
}

function videoScore(v: VideoCard, taste: Taste): number {
  const affinity = taste.channels.get(channelKey(v)) ?? 0;
  const subscribed = taste.following.has(followKey({ kind: v.source === "youtube" ? "youtube" : "jace", ref: v.channelId }));
  const fresh = Math.exp(-ageDays(v.publishedAt) / (subscribed ? 3 : 6));
  const popular = v.views ? Math.min(1, Math.log10(v.views + 1) / 7) : 0.35;
  const title = v.title.toLowerCase();
  const topical = taste.keywords.some((k) => title.includes(k)) ? 0.5 : 0;
  let score = 3 * affinity + (subscribed ? 1.4 : 0) + 2 * fresh + popular + topical + 0.8 * jitter(taste.seed, v.id);
  const watched = taste.watched.get(`${v.source}:${v.id}`);
  if (watched) score *= watched > 2 ? 0.5 : 0.15; // something you rewatch a lot can come back
  return score;
}

/**
 * Picks the best items while keeping variety: each repeat of the same channel
 * (or network) costs a little, so one source never fills the page.
 */
function diverse<T>(items: { item: T; score: number; group: string }[], limit: number, penalty: number): T[] {
  const pool = [...items];
  const used = new Map<string, number>();
  const out: T[] = [];
  while (out.length < limit && pool.length) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i].score - penalty * (used.get(pool[i].group) ?? 0);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    const [pick] = pool.splice(best, 1);
    used.set(pick.group, (used.get(pick.group) ?? 0) + 1);
    out.push(pick.item);
  }
  return out;
}

function dedupe(videos: VideoCard[]): VideoCard[] {
  const seen = new Set<string>();
  return videos.filter((v) => !seen.has(`${v.source}:${v.id}`) && seen.add(`${v.source}:${v.id}`));
}

/** What extensions and "Not interested" take out of any list of videos. */
function allowed(v: VideoCard, taste: Taste): boolean {
  if (taste.hiddenVideos.has(`${v.source}:${v.id}`) || taste.hiddenChannels.has(channelKey(v))) return false;
  if (taste.ext.hideWatched && taste.watched.has(`${v.source}:${v.id}`)) return false;
  if (taste.ext.hideShorts && v.short) return false;
  return true;
}

export function rankVideos(videos: VideoCard[], taste: Taste, limit = 48): VideoCard[] {
  const visible = dedupe(videos).filter((v) => allowed(v, taste));
  return diverse(
    visible.map((v) => ({ item: v, score: videoScore(v, taste), group: channelKey(v) })),
    limit,
    0.9,
  );
}

export function latestVideos(videos: VideoCard[], taste: Taste, limit = 48): VideoCard[] {
  return dedupe(videos)
    .filter((v) => allowed(v, taste))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, limit);
}

/**
 * Videos worth considering: new uploads from the channels you subscribe to
 * and watch most, popular videos (or a starter set of channels), searches
 * for topics you've been watching (with a YouTube API key), and Jace videos.
 */
export const videoCandidates = cache(async (subscriptionsOnly: boolean = false, folder: string | null = null): Promise<VideoCard[]> => {
  const taste = await getTaste();
  const wantYouTube = taste.services.includes("youtube");
  const wantJace = taste.services.includes("jacevideos");

  const watchedMost = [...taste.channels.entries()]
    .filter(([k]) => k.startsWith("youtube:"))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k.slice(8));
  // Following keys are lower-cased; channel ids are case-sensitive, so use the stored ones.
  const subIds = await subscribedChannelIds(folder);
  const channelIds = subscriptionsOnly ? subIds.slice(0, 60) : [...new Set([...watchedMost.slice(0, 25), ...subIds.slice(0, 30)])].slice(0, 45);

  const tasks: Promise<VideoCard[]>[] = [];
  if (wantYouTube) {
    tasks.push(Promise.all(channelIds.map(channelFeed)).then((feeds) => feeds.flatMap((f) => f?.videos ?? [])));
    if (!subscriptionsOnly) {
      tasks.push(hasYouTubeApi ? trending(40) : Promise.resolve([]));
      if (channelIds.length < 8) tasks.push(featuredYouTube(40));
      if (hasYouTubeApi && taste.keywords.length) {
        const topics = taste.keywords.slice(0, 2);
        tasks.push(Promise.all(topics.map((t) => search(t, 12))).then((r) => r.flatMap((x) => x ?? [])));
      }
    }
  }
  if (wantJace) {
    if (subscriptionsOnly) {
      const jaceFollows = folder
        ? await jaceFolderIds(folder)
        : [...taste.following].filter((k) => k.startsWith("jace:")).map((k) => k.slice(5));
      tasks.push(jaceVideos({ limit: 60 }).then((r) => r.videos.filter((v) => jaceFollows.includes(v.channelId.toLowerCase()))));
    } else tasks.push(jaceVideos({ limit: 60 }).then((r) => r.videos));
  }
  return (await Promise.all(tasks)).flat();
});

async function jaceFolderIds(folder: string): Promise<string[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const rows = await q(`SELECT ref FROM subscriptions WHERE sub = $1 AND kind = 'jace' AND folder = $2`, [viewer.sub, folder]);
  return rows.map((r) => (r.ref as string).toLowerCase());
}

const subscribedChannelIds = cache(async (folder: string | null = null): Promise<string[]> => {
  const viewer = await getViewer();
  if (!viewer) return [];
  const rows = folder
    ? await q(`SELECT ref FROM subscriptions WHERE sub = $1 AND kind = 'youtube' AND folder = $2 ORDER BY created_at DESC`, [viewer.sub, folder])
    : await q(`SELECT ref FROM subscriptions WHERE sub = $1 AND kind = 'youtube' ORDER BY created_at DESC`, [viewer.sub]);
  return rows.map((r) => r.ref as string);
});

export async function recommendedVideos(opts: { limit?: number; shorts?: boolean; exclude?: string } = {}): Promise<VideoCard[]> {
  const taste = await getTaste();
  // Focus mode: only subscriptions, no recommendations from elsewhere.
  const candidates = await videoCandidates(taste.ext.focus && taste.signedIn);
  const pool = candidates.filter((v) => !!v.short === !!opts.shorts && v.id !== opts.exclude);
  return rankVideos(pool, taste, opts.limit ?? 48);
}

// ---------- Posts ----------

function postScore(p: FeedItem, taste: Taste): number {
  const hours = Math.max(0, (Date.now() - Date.parse(p.createdAt)) / 3_600_000);
  const fresh = Math.exp(-hours / 20);
  const s = p.stats;
  const engagement = Math.min(1.3, Math.log10((s.likes ?? 0) + (s.reposts ?? 0) * 2 + (s.score ?? 0) + (s.replies ?? 0) + 1) / 3.5);
  let follow = 0;
  const handle = p.author.handle.replace(/^@/, "").toLowerCase();
  if (p.network === "jace" && p.authorSub && taste.following.has(`jace:${p.authorSub.toLowerCase()}`)) follow = 2.5;
  if ((p.network === "bluesky" || p.network === "mastodon") && taste.following.has(`${p.network}:${handle}`)) follow = 2.5;
  if (p.network === "lemmy" && p.place && taste.following.has(`lemmy:${p.place.replace(/^c\//, "").toLowerCase()}`)) follow = 1.8;
  const liked = p.authorSub ? Math.min(1, (taste.likedAuthors.get(p.authorSub) ?? 0) / 3) : 0;
  const text = `${p.title ?? ""} ${p.text}`.toLowerCase();
  const topical = taste.keywords.some((k) => text.includes(k)) ? 0.4 : 0;
  // Jace's own posts get a small lift so the community shows up among the big networks.
  const home = p.network === "jace" ? 0.4 : 0;
  return 2 * fresh + engagement + follow + liked + topical + home + 0.6 * jitter(taste.seed, `${p.network}:${p.id}`);
}

export function rankPosts(posts: FeedItem[], taste: Taste, limit = 60): FeedItem[] {
  const seen = new Set<string>();
  const unique = posts.filter((p) => !seen.has(`${p.network}:${p.id}`) && seen.add(`${p.network}:${p.id}`));
  return diverse(
    unique.map((p) => ({ item: p, score: postScore(p, taste), group: p.network })),
    limit,
    0.25,
  );
}
