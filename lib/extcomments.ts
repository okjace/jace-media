import "server-only";
import { randomUUID } from "crypto";
import { q } from "./db";
import { toProfile } from "./profiles";
import type { FeedItem, Profile } from "./types";

/** Jace Media comments on posts from other networks. They live here; the other network never sees them. */

export const EXT_NETWORKS = ["bluesky", "mastodon", "lemmy", "hackernews"] as const;
export type ExtCommentNetwork = (typeof EXT_NETWORKS)[number];
const MAX = 500;

export function isExtNetwork(v: unknown): v is ExtCommentNetwork {
  return typeof v === "string" && (EXT_NETWORKS as readonly string[]).includes(v);
}

export async function listExtComments(network: ExtCommentNetwork, postId: string, viewer: { sub: string; isAdmin: boolean } | null): Promise<FeedItem[]> {
  const rows = await q(
    `SELECT c.id, c.body, c.created_at, c.author_sub, pr.* FROM ext_comments c JOIN profiles pr ON pr.sub = c.author_sub
     WHERE c.network = $1 AND c.post_id = $2 AND pr.banned = FALSE ORDER BY c.created_at ASC LIMIT 300`,
    [network, postId],
  );
  return rows.map((r) => {
    const author = toProfile(r);
    return {
      network: "jace",
      id: r.id as string,
      author: { name: author.name, handle: author.handle, picture: author.picture, url: `/u/${encodeURIComponent(author.handle)}` },
      authorSub: r.author_sub as string,
      text: r.body as string,
      url: "",
      media: [],
      createdAt: new Date(Number(r.created_at)).toISOString(),
      stats: {},
      canDelete: !!viewer && (viewer.sub === r.author_sub || viewer.isAdmin),
    } satisfies FeedItem;
  });
}

export async function addExtComment(author: Profile, network: ExtCommentNetwork, postId: string, body: string): Promise<{ id: string } | { error: string }> {
  if (author.muted) return { error: "Your Jace account is muted, so you can't comment right now." };
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "Write something first." };
  if (text.length > MAX) return { error: `Comments can be up to ${MAX} characters.` };
  if (postId.length > 300) return { error: "That post can't be commented on." };
  const recent = await q(`SELECT count(*)::int AS n FROM ext_comments WHERE author_sub = $1 AND created_at > $2`, [author.sub, Date.now() - 60_000]);
  if (Number(recent[0]?.n) >= 10) return { error: "You're commenting very fast. Wait a minute." };
  const id = randomUUID();
  await q(`INSERT INTO ext_comments (id, network, post_id, author_sub, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
    id,
    network,
    postId,
    author.sub,
    text,
    Date.now(),
  ]);
  return { id };
}

export async function deleteExtComment(viewer: { sub: string; isAdmin: boolean }, id: string): Promise<boolean> {
  const rows = await q(`SELECT author_sub FROM ext_comments WHERE id = $1`, [id]);
  if (!rows[0] || (rows[0].author_sub !== viewer.sub && !viewer.isAdmin)) return false;
  await q(`DELETE FROM ext_comments WHERE id = $1`, [id]);
  return true;
}

export async function extCommentCounts(keys: { network: string; id: string }[]): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const rows = await q(
    `SELECT network, post_id, count(*)::int AS n FROM ext_comments WHERE post_id = ANY($1::text[]) GROUP BY network, post_id`,
    [keys.map((k) => k.id)],
  );
  return new Map(rows.map((r) => [`${r.network}:${r.post_id}`, Number(r.n)]));
}
