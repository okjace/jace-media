import "server-only";
import { randomUUID } from "crypto";
import { getViewer } from "./auth";
import { q } from "./db";
import { jacePosts } from "./feeds";
import { getTaste, latestVideos, rankPosts, rankVideos, videoCandidates } from "./recommend";
import { ALL_SERVICES, isService, type Service } from "./services";
import { fetchFeed } from "./rss";
import { NETWORKS, blueskyAuthor, lemmyCommunity, mastodonAuthor } from "./social";
import type { FeedItem, VideoCard } from "./types";

/**
 * Custom feeds: pick services, "everything" or "subscriptions only", posts /
 * videos / Shorts, words to include or leave out, and recommended or newest
 * first. The Subscriptions tab is one of these with fixed rules.
 */

export type FeedRules = {
  services: Service[];
  only: "all" | "subscriptions";
  content: "all" | "posts" | "videos" | "shorts";
  include: string[];
  exclude: string[];
  sort: "recommended" | "latest";
  /** Subscriptions-only feeds can be narrowed to one subscription folder. */
  folder: string | null;
};

export type CustomFeed = { id: string; name: string; rules: FeedRules; shared?: boolean };

export type Entry = { kind: "post"; item: FeedItem } | { kind: "video"; video: VideoCard };

export const MAX_FEEDS = 20;

const words = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20)
    .map((w) => w.slice(0, 40));

/** Cleans rules from the browser (or the database) into a valid set. */
export function cleanRules(raw: unknown): FeedRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const services = Array.isArray(r.services) ? r.services.filter(isService) : [];
  return {
    services: services.length ? services : ALL_SERVICES,
    only: r.only === "subscriptions" ? "subscriptions" : "all",
    content: r.content === "posts" || r.content === "videos" || r.content === "shorts" ? r.content : "all",
    include: words(r.include),
    exclude: words(r.exclude),
    sort: r.sort === "latest" ? "latest" : "recommended",
    folder: typeof r.folder === "string" && r.folder.trim() ? r.folder.trim().slice(0, 30) : null,
  };
}

export async function listFeeds(sub: string): Promise<CustomFeed[]> {
  const rows = await q(`SELECT id, name, rules FROM feeds WHERE sub = $1 ORDER BY created_at`, [sub]);
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, rules: cleanRules(JSON.parse(r.rules as string)) }));
}

export async function getFeed(sub: string, id: string): Promise<CustomFeed | null> {
  const rows = await q(`SELECT id, name, rules, shared FROM feeds WHERE sub = $1 AND id = $2`, [sub, id]);
  return rows[0]
    ? { id: rows[0].id as string, name: rows[0].name as string, rules: cleanRules(JSON.parse(rows[0].rules as string)), shared: !!rows[0].shared }
    : null;
}

function cleanName(name: unknown): string | null {
  const n = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return n.length ? n : null;
}

export async function saveFeed(sub: string, input: { id?: string; name: unknown; rules: unknown }): Promise<CustomFeed | { error: string }> {
  const name = cleanName(input.name);
  if (!name) return { error: "Give your feed a name." };
  const rules = cleanRules(input.rules);
  if (input.id) {
    const done = await q(`UPDATE feeds SET name = $3, rules = $4 WHERE sub = $1 AND id = $2 RETURNING id`, [sub, input.id, name, JSON.stringify(rules)]);
    if (!done[0]) return { error: "That feed was deleted." };
    return { id: input.id, name, rules };
  }
  const count = await q(`SELECT count(*)::int AS n FROM feeds WHERE sub = $1`, [sub]);
  if (Number(count[0]?.n) >= MAX_FEEDS) return { error: `You can have up to ${MAX_FEEDS} feeds.` };
  const id = randomUUID();
  await q(`INSERT INTO feeds (id, sub, name, rules, created_at) VALUES ($1, $2, $3, $4, $5)`, [id, sub, name, JSON.stringify(rules), Date.now()]);
  return { id, name, rules };
}

/** Turns sharing on or off for one of your feeds. */
export async function setShared(sub: string, id: string, shared: boolean): Promise<boolean> {
  const done = await q(`UPDATE feeds SET shared = $3 WHERE sub = $1 AND id = $2 RETURNING id`, [sub, id, shared]);
  return done.length > 0;
}

/** A feed someone shared, with who made it. */
export async function getSharedFeed(id: string): Promise<(CustomFeed & { ownerSub: string }) | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const rows = await q(`SELECT id, sub, name, rules FROM feeds WHERE id = $1 AND shared = TRUE`, [id]);
  const r = rows[0];
  return r ? { id: r.id as string, name: r.name as string, rules: cleanRules(JSON.parse(r.rules as string)), shared: true, ownerSub: r.sub as string } : null;
}

/** Saves a copy of a shared feed to your feeds. */
export async function copySharedFeed(sub: string, id: string): Promise<CustomFeed | { error: string }> {
  const feed = await getSharedFeed(id);
  if (!feed) return { error: "That feed isn't shared anymore." };
  return saveFeed(sub, { name: feed.name, rules: feed.rules });
}

export async function deleteFeed(sub: string, id: string): Promise<void> {
  await q(`DELETE FROM feeds WHERE sub = $1 AND id = $2`, [sub, id]);
}

// ---------- Building a feed ----------

async function followedPosts(services: Service[], folder: string | null): Promise<FeedItem[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const subs = folder
    ? await q(`SELECT kind, ref FROM subscriptions WHERE sub = $1 AND folder = $2 ORDER BY created_at DESC`, [viewer.sub, folder])
    : await q(`SELECT kind, ref FROM subscriptions WHERE sub = $1 ORDER BY created_at DESC`, [viewer.sub]);
  const refs = (kind: string, cap: number) => subs.filter((s) => s.kind === kind).slice(0, cap).map((s) => s.ref as string);
  const tasks: Promise<FeedItem[]>[] = [];
  if (services.includes("jace")) tasks.push(jacePosts({ authorSubs: refs("jace", 500), limit: 60 }).then((r) => r.items));
  if (services.includes("bluesky")) tasks.push(Promise.all(refs("bluesky", 25).map((h) => blueskyAuthor(h, 8))).then((r) => r.flat()));
  if (services.includes("mastodon")) tasks.push(Promise.all(refs("mastodon", 15).map((a) => mastodonAuthor(a, 8))).then((r) => r.flat()));
  if (services.includes("lemmy")) tasks.push(Promise.all(refs("lemmy", 15).map((c) => lemmyCommunity(c, 8))).then((r) => r.flat()));
  if (services.includes("rss")) tasks.push(Promise.all(refs("rss", 25).map((u) => fetchFeed(u))).then((r) => r.flatMap((f) => f?.items.slice(0, 8) ?? [])));
  return (await Promise.all(tasks)).flat();
}

async function everyPost(services: Service[]): Promise<FeedItem[]> {
  const tasks: Promise<FeedItem[]>[] = [];
  if (services.includes("jace")) tasks.push(jacePosts({ limit: 40 }).then((r) => r.items));
  for (const key of ["bluesky", "mastodon", "lemmy", "hackernews"] as const) {
    if (services.includes(key)) tasks.push(NETWORKS[key].load(30).then((r) => r ?? []));
  }
  return (await Promise.all(tasks)).flat();
}

function matches(text: string, rules: FeedRules): boolean {
  const t = text.toLowerCase();
  if (rules.exclude.some((w) => t.includes(w))) return false;
  return rules.include.length === 0 || rules.include.some((w) => t.includes(w));
}

/** Two posts, then a video, and so on. */
function mix(posts: FeedItem[], videos: VideoCard[]): Entry[] {
  const out: Entry[] = [];
  let v = 0;
  posts.forEach((item, i) => {
    out.push({ kind: "post", item });
    if (i % 2 === 1 && v < videos.length) out.push({ kind: "video", video: videos[v++] });
  });
  while (v < videos.length) out.push({ kind: "video", video: videos[v++] });
  return out;
}

export async function buildFeed(rules: FeedRules, limit = 60): Promise<Entry[]> {
  const taste = await getTaste();
  const wantPosts = rules.content === "all" || rules.content === "posts";
  const wantVideos = rules.content !== "posts" && (rules.services.includes("youtube") || rules.services.includes("jacevideos"));
  const subsOnly = rules.only === "subscriptions";

  const [posts, candidates] = await Promise.all([
    wantPosts ? (subsOnly ? followedPosts(rules.services, rules.folder) : everyPost(rules.services)) : Promise.resolve([]),
    wantVideos ? videoCandidates(subsOnly, subsOnly ? rules.folder : null) : Promise.resolve([]),
  ]);

  const keptPosts = posts.filter((p) => matches(`${p.title ?? ""} ${p.text} ${p.author.name}`, rules));
  const keptVideos = candidates.filter((v) => {
    if (v.source === "youtube" && !rules.services.includes("youtube")) return false;
    if (v.source === "jace" && !rules.services.includes("jacevideos")) return false;
    if (rules.content === "shorts" && !v.short) return false;
    if (rules.content !== "shorts" && rules.content !== "all" && v.short) return false;
    return matches(`${v.title} ${v.channelName}`, rules);
  });

  if (rules.sort === "latest") {
    const entries: (Entry & { at: string })[] = [
      ...keptPosts.map((item) => ({ kind: "post" as const, item, at: item.createdAt })),
      ...latestVideos(keptVideos, taste, limit).map((video) => ({ kind: "video" as const, video, at: video.publishedAt ?? "" })),
    ];
    return entries
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
      .map((e): Entry => (e.kind === "post" ? { kind: "post", item: e.item } : { kind: "video", video: e.video }));
  }
  return mix(rankPosts(keptPosts, taste, limit), rankVideos(keptVideos, taste, Math.ceil(limit / 2))).slice(0, limit);
}
