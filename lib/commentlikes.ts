import "server-only";
import { q } from "./db";

/**
 * Likes on comments, kept on Jace Media: YouTube comments ("yt:<id>"), Jace video
 * comments ("jace:<id>") and Jace Media's own comments ("ext:<id>"). A like here
 * adds to the comment's count on Jace Media; YouTube never sees it.
 */

export const COMMENT_KEY = /^(yt|jace|ext):[\w.:-]{1,200}$/;

export type LikeInfo = { count: number; mine: boolean };

export async function commentLikes(keys: string[], sub: string | null): Promise<Map<string, LikeInfo>> {
  const list = [...new Set(keys.filter((k) => COMMENT_KEY.test(k)))];
  const out = new Map<string, LikeInfo>();
  if (list.length === 0) return out;
  const rows = await q(
    `SELECT comment_key, count(*)::int AS n, bool_or(sub = $2) AS mine FROM comment_likes WHERE comment_key = ANY($1) GROUP BY comment_key`,
    [list, sub ?? ""],
  ).catch(() => []);
  for (const r of rows) out.set(r.comment_key as string, { count: Number(r.n), mine: !!r.mine });
  return out;
}

export async function setCommentLike(sub: string, key: string, on: boolean): Promise<LikeInfo> {
  if (on) await q(`INSERT INTO comment_likes (comment_key, sub, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [key, sub, Date.now()]);
  else await q(`DELETE FROM comment_likes WHERE comment_key = $1 AND sub = $2`, [key, sub]);
  return (await commentLikes([key], sub)).get(key) ?? { count: 0, mine: false };
}
