import "server-only";
import { cache } from "react";
import { getViewer } from "./auth";
import { q } from "./db";
import { getExtensions } from "./prefs";
import { textBlocked, votesBlock } from "./rating";
import type { FeedItem, VideoCard } from "./types";

/** Applies the content rating to lists of posts and videos. Never throws. */

const myRatings = cache(async (): Promise<Map<string, number>> => {
  const viewer = await getViewer();
  if (!viewer) return new Map();
  try {
    const rows = await q(`SELECT target, rating FROM content_ratings WHERE sub = $1`, [viewer.sub]);
    return new Map(rows.map((r) => [r.target as string, Number(r.rating)]));
  } catch {
    return new Map();
  }
});

/** Posts you said you're not interested in, and people whose posts you hid. */
const myHidden = cache(async (): Promise<Set<string>> => {
  const viewer = await getViewer();
  if (!viewer) return new Set();
  try {
    const rows = await q(`SELECT kind, ref FROM hidden WHERE sub = $1 AND kind IN ('post', 'author')`, [viewer.sub]);
    return new Set(rows.map((r) => `${r.kind}|${r.ref}`));
  } catch {
    return new Set();
  }
});

async function votes(targets: string[]): Promise<Map<string, { good: number; bad: number }>> {
  if (targets.length === 0) return new Map();
  try {
    const rows = await q(
      `SELECT target, count(*) FILTER (WHERE rating > 0)::int AS good, count(*) FILTER (WHERE rating < 0)::int AS bad
       FROM content_ratings WHERE target = ANY($1::text[]) GROUP BY target`,
      [targets],
    );
    return new Map(rows.map((r) => [r.target as string, { good: Number(r.good), bad: Number(r.bad) }]));
  } catch {
    return new Map();
  }
}

async function filter<T>(items: T[], key: (x: T) => string, text: (x: T) => string): Promise<T[]> {
  if (items.length === 0) return items;
  const [ext, mine, counts] = await Promise.all([getExtensions(), myRatings(), votes(items.map(key))]);
  return items.filter((x) => {
    const k = key(x);
    if (mine.get(k) === -1) return false;
    if (mine.get(k) === 1) return true; // you said it's fine
    if (textBlocked(text(x), ext.rating)) return false;
    const v = counts.get(k);
    return !v || !votesBlock(v.good, v.bad, ext.rating);
  });
}

export async function filterPosts(items: FeedItem[]): Promise<FeedItem[]> {
  const hidden = await myHidden();
  if (hidden.size) items = items.filter((p) => !hidden.has(`post|${p.network}:${p.id}`) && !hidden.has(`author|${p.network}:${p.author.handle}`));
  return filter(items, (p) => `${p.network}:${p.id}`, (p) => `${p.title ?? ""} ${p.text} ${p.author.name}`);
}

export function filterVideos(videos: VideoCard[]): Promise<VideoCard[]> {
  return filter(videos, (v) => `${v.source}:${v.id}`, (v) => `${v.title} ${v.channelName}`);
}
