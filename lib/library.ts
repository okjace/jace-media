import "server-only";
import { q } from "./db";

/**
 * Someone's library: who they follow on each service, what they watched,
 * which videos they liked, and what they asked not to be recommended. All of
 * it feeds the recommendations (lib/recommend.ts).
 */

export type SubKind = "youtube" | "jace" | "bluesky" | "mastodon" | "lemmy" | "rss";
export const SUB_KINDS: SubKind[] = ["youtube", "jace", "bluesky", "mastodon", "lemmy", "rss"];

export type Subscription = { kind: SubKind; ref: string; name: string; picture: string | null; folder?: string | null };

export function isSubKind(v: unknown): v is SubKind {
  return typeof v === "string" && (SUB_KINDS as string[]).includes(v);
}

/** Checks a subscription ref has the right shape for its kind. */
export function validRef(kind: SubKind, ref: string): boolean {
  switch (kind) {
    case "youtube":
      return /^UC[A-Za-z0-9_-]{22}$/.test(ref);
    case "jace":
      return /^[A-Za-z0-9_-]{1,64}$/.test(ref);
    case "bluesky":
      return /^[a-z0-9.-]{3,253}$/i.test(ref);
    case "mastodon":
    case "lemmy":
      return /^[A-Za-z0-9_.-]{1,64}@[a-z0-9.-]{3,253}$/i.test(ref);
    case "rss":
      return /^https?:\/\/[^\s]{4,500}$/.test(ref);
  }
}

export async function listSubscriptions(sub: string, kind?: SubKind): Promise<Subscription[]> {
  const rows = kind
    ? await q(`SELECT kind, ref, name, picture, folder FROM subscriptions WHERE sub = $1 AND kind = $2 ORDER BY lower(name)`, [sub, kind])
    : await q(`SELECT kind, ref, name, picture, folder FROM subscriptions WHERE sub = $1 ORDER BY lower(name)`, [sub]);
  return rows.map((r) => ({
    kind: r.kind as SubKind,
    ref: r.ref as string,
    name: r.name as string,
    picture: (r.picture as string) ?? null,
    folder: (r.folder as string) ?? null,
  }));
}

export async function subscribe(sub: string, s: Subscription): Promise<void> {
  await q(
    `INSERT INTO subscriptions (sub, kind, ref, name, picture, created_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sub, kind, ref) DO UPDATE SET name = EXCLUDED.name, picture = COALESCE(EXCLUDED.picture, subscriptions.picture)`,
    [sub, s.kind, s.ref, s.name.slice(0, 120), s.picture, Date.now()],
  );
}

/** Puts a subscription in a folder (null takes it out). */
export async function setFolder(sub: string, kind: SubKind, ref: string, folder: string | null): Promise<void> {
  const name = folder?.replace(/\s+/g, " ").trim().slice(0, 30) || null;
  await q(`UPDATE subscriptions SET folder = $4 WHERE sub = $1 AND kind = $2 AND ref = $3`, [sub, kind, ref, name]);
}

export async function unsubscribe(sub: string, kind: SubKind, ref: string): Promise<void> {
  await q(`DELETE FROM subscriptions WHERE sub = $1 AND kind = $2 AND ref = $3`, [sub, kind, ref]);
}

export async function isSubscribed(sub: string, kind: SubKind, ref: string): Promise<boolean> {
  const rows = await q(`SELECT 1 FROM subscriptions WHERE sub = $1 AND kind = $2 AND ref = $3`, [sub, kind, ref]);
  return rows.length > 0;
}

export type HistoryInput = {
  source: "youtube" | "jace";
  id: string;
  title: string;
  channelId?: string | null;
  channelName?: string | null;
  watchedAt?: number;
  thumbnail?: string | null;
  /** How many times (imports only; a live watch counts 1). */
  count?: number;
};

const MAX_HISTORY = 5000;

/** Records watches (one at a time from the player, or thousands from a YouTube import). */
export async function recordWatches(sub: string, input: HistoryInput[], opts: { imported?: boolean } = {}): Promise<number> {
  // One row per video: Postgres can't update the same row twice in one INSERT.
  const merged = new Map<string, HistoryInput>();
  for (const e of input) {
    const key = `${e.source}:${e.id}`;
    const seen = merged.get(key);
    if (!seen) merged.set(key, { ...e, count: e.count ?? 1 });
    else {
      seen.count = (seen.count ?? 1) + (e.count ?? 1);
      if ((e.watchedAt ?? 0) > (seen.watchedAt ?? 0)) seen.watchedAt = e.watchedAt;
      seen.channelId ??= e.channelId;
      seen.channelName ??= e.channelName;
    }
  }
  const entries = [...merged.values()];
  let saved = 0;
  // Batches of 200 rows per INSERT keep imports quick.
  for (let i = 0; i < entries.length; i += 200) {
    const batch = entries.slice(i, i + 200);
    const values: unknown[] = [];
    const rows = batch.map((e, j) => {
      const b = j * 9;
      values.push(
        sub,
        e.source,
        e.id,
        e.title.slice(0, 200),
        e.channelId ?? null,
        e.channelName?.slice(0, 120) ?? null,
        Math.max(1, Math.min(10_000, Math.floor(e.count ?? 1))),
        e.watchedAt ?? Date.now(),
        e.thumbnail ?? null,
      );
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`;
    });
    await q(
      `INSERT INTO watch_history (sub, source, video_id, title, channel_id, channel_name, watch_count, watched_at, thumbnail)
       VALUES ${rows.join(", ")}
       ON CONFLICT (sub, source, video_id) DO UPDATE SET
         watch_count = ${opts.imported ? "GREATEST(watch_history.watch_count, EXCLUDED.watch_count)" : "watch_history.watch_count + 1"},
         watched_at = GREATEST(watch_history.watched_at, EXCLUDED.watched_at),
         title = EXCLUDED.title,
         channel_id = COALESCE(EXCLUDED.channel_id, watch_history.channel_id),
         channel_name = COALESCE(EXCLUDED.channel_name, watch_history.channel_name),
         thumbnail = COALESCE(EXCLUDED.thumbnail, watch_history.thumbnail)`,
      values,
    );
    saved += batch.length;
  }
  if (opts.imported || Math.random() < 0.05) {
    // Keep only the newest MAX_HISTORY videos per person.
    await q(
      `DELETE FROM watch_history WHERE sub = $1 AND (source, video_id) NOT IN (
         SELECT source, video_id FROM watch_history WHERE sub = $1 ORDER BY watched_at DESC LIMIT ${MAX_HISTORY})`,
      [sub],
    );
  }
  return saved;
}

export async function recentHistory(sub: string, limit = 100) {
  const rows = await q(
    `SELECT source, video_id, title, channel_id, channel_name, watch_count, watched_at FROM watch_history
     WHERE sub = $1 ORDER BY watched_at DESC LIMIT $2`,
    [sub, limit],
  );
  return rows.map((r) => ({
    source: r.source as "youtube" | "jace",
    id: r.video_id as string,
    title: r.title as string,
    channelId: (r.channel_id as string) ?? null,
    channelName: (r.channel_name as string) ?? null,
    count: Number(r.watch_count),
    watchedAt: Number(r.watched_at),
  }));
}

export async function clearHistory(sub: string): Promise<void> {
  await q(`DELETE FROM watch_history WHERE sub = $1`, [sub]);
}

export async function likeVideos(sub: string, source: "youtube" | "jace", ids: { id: string; channelId?: string | null }[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 300) {
    const batch = ids.slice(i, i + 300);
    const values: unknown[] = [];
    const rows = batch.map((v, j) => {
      values.push(sub, source, v.id, v.channelId ?? null, Date.now());
      const b = j * 5;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
    });
    await q(
      `INSERT INTO video_likes (sub, source, video_id, channel_id, created_at) VALUES ${rows.join(", ")}
       ON CONFLICT (sub, source, video_id) DO UPDATE SET channel_id = COALESCE(EXCLUDED.channel_id, video_likes.channel_id)`,
      values,
    );
  }
}

export async function unlikeVideo(sub: string, source: "youtube" | "jace", id: string): Promise<void> {
  await q(`DELETE FROM video_likes WHERE sub = $1 AND source = $2 AND video_id = $3`, [sub, source, id]);
}

export async function isVideoLiked(sub: string, source: "youtube" | "jace", id: string): Promise<boolean> {
  return (await videoVote(sub, source, id)) === 1;
}

/** Your vote on a video: 1 (liked), -1 (disliked), or 0. */
export async function videoVote(sub: string, source: "youtube" | "jace", id: string): Promise<1 | -1 | 0> {
  const rows = await q(`SELECT value FROM video_likes WHERE sub = $1 AND source = $2 AND video_id = $3`, [sub, source, id]);
  const v = Number(rows[0]?.value ?? 0);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Like (1), dislike (-1), or clear (0) a video. */
export async function voteVideo(sub: string, source: "youtube" | "jace", id: string, channelId: string | null, value: 1 | -1 | 0): Promise<void> {
  if (value === 0) {
    await q(`DELETE FROM video_likes WHERE sub = $1 AND source = $2 AND video_id = $3`, [sub, source, id]);
    return;
  }
  await q(
    `INSERT INTO video_likes (sub, source, video_id, channel_id, value, created_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sub, source, video_id) DO UPDATE SET value = EXCLUDED.value, channel_id = COALESCE(EXCLUDED.channel_id, video_likes.channel_id)`,
    [sub, source, id, channelId, value, Date.now()],
  );
}

/** How many people on Jace Media disliked a video (Jace videos have no public dislike count). */
export async function dislikeCount(source: "youtube" | "jace", id: string): Promise<number> {
  const rows = await q(`SELECT count(*)::int AS n FROM video_likes WHERE source = $1 AND video_id = $2 AND value < 0`, [source, id]);
  return Number(rows[0]?.n ?? 0);
}

export async function hide(sub: string, kind: "video" | "channel" | "post" | "author", ref: string): Promise<void> {
  await q(`INSERT INTO hidden (sub, kind, ref, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [sub, kind, ref, Date.now()]);
}

export async function unhideAll(sub: string): Promise<void> {
  await q(`DELETE FROM hidden WHERE sub = $1`, [sub]);
}

/** Counts for the Library page. */
export async function libraryCounts(sub: string) {
  const rows = await q(
    `SELECT
      (SELECT count(*) FROM subscriptions WHERE sub = $1)::int AS subs,
      (SELECT count(*) FROM watch_history WHERE sub = $1)::int AS history,
      (SELECT count(*) FROM video_likes WHERE sub = $1 AND value > 0)::int AS liked,
      (SELECT count(*) FROM hidden WHERE sub = $1)::int AS hidden`,
    [sub],
  );
  return { subs: Number(rows[0].subs), history: Number(rows[0].history), liked: Number(rows[0].liked), hidden: Number(rows[0].hidden) };
}

/** YouTube subscriptions saved without a picture (imports, older follows) get one, once. */
export async function fillSubscriptionPictures(sub: string, subs: Subscription[]): Promise<Subscription[]> {
  const missing = subs.filter((s) => s.kind === "youtube" && !s.picture).map((s) => s.ref);
  if (!missing.length) return subs;
  const { channelPictures, hasYouTubeApi } = await import("./youtube");
  if (!hasYouTubeApi) return subs;
  const pictures = await channelPictures(missing).catch(() => new Map<string, string>());
  for (const [ref, picture] of pictures) {
    await q(`UPDATE subscriptions SET picture = $3 WHERE sub = $1 AND kind = 'youtube' AND ref = $2`, [sub, ref, picture]);
  }
  return subs.map((s) => (s.kind === "youtube" && pictures.has(s.ref) ? { ...s, picture: pictures.get(s.ref)! } : s));
}

/** The parts of your library that can be reset. */
export const RESET_PARTS = ["history", "likes", "playlists", "hidden", "subscriptions", "feeds", "ratings"] as const;
export type ResetPart = (typeof RESET_PARTS)[number];

/** Deletes the chosen parts of your library. Your posts and comments stay. */
export async function resetLibrary(sub: string, parts: ResetPart[]): Promise<void> {
  const sql: Record<ResetPart, string[]> = {
    history: [`DELETE FROM watch_history WHERE sub = $1`],
    likes: [`DELETE FROM video_likes WHERE sub = $1`],
    playlists: [`DELETE FROM playlist_items WHERE playlist_id IN (SELECT id FROM playlists WHERE sub = $1)`, `DELETE FROM playlists WHERE sub = $1`],
    hidden: [`DELETE FROM hidden WHERE sub = $1`],
    subscriptions: [`DELETE FROM subscriptions WHERE sub = $1`],
    feeds: [`DELETE FROM feeds WHERE sub = $1`],
    ratings: [`DELETE FROM content_ratings WHERE sub = $1`],
  };
  for (const part of parts) for (const statement of sql[part]) await q(statement, [sub]);
}
