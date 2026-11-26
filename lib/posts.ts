import "server-only";
import { randomUUID } from "crypto";
import { q } from "./db";
import { saveImage, toProfile } from "./profiles";
import type { FeedItem, Profile } from "./types";

/** Jace posts: what people post on Jace Media itself, with likes and replies. */

export const MAX_POST = 500;

type Viewer = { sub: string; isAdmin: boolean } | null;

const SELECT = `
  SELECT p.id, p.parent_id, p.body, p.image_id, p.created_at, p.author_sub,
    pr.sub, pr.handle, pr.jace_name, pr.jace_picture, pr.display_name, pr.avatar_id, pr.bio, pr.is_admin, pr.muted,
    (SELECT count(*) FROM likes l WHERE l.post_id = p.id)::int AS like_count,
    (SELECT count(*) FROM posts r WHERE r.parent_id = p.id)::int AS reply_count,
    EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.sub = $1) AS liked
  FROM posts p JOIN profiles pr ON pr.sub = p.author_sub
`;

function toItem(r: Record<string, unknown>, viewer: Viewer): FeedItem & { parentId: string | null } {
  const author: Profile = toProfile(r);
  return {
    network: "jace",
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    author: { name: author.name, handle: author.handle, picture: author.picture, url: `/u/${encodeURIComponent(author.handle)}` },
    text: r.body as string,
    url: `/post/${r.id}`,
    media: r.image_id ? [{ kind: "image", url: `/api/images/${r.image_id}` }] : [],
    createdAt: new Date(Number(r.created_at)).toISOString(),
    stats: { likes: Number(r.like_count), replies: Number(r.reply_count) },
    authorSub: r.author_sub as string,
    likedByMe: !!r.liked,
    canDelete: !!viewer && (viewer.sub === r.author_sub || viewer.isAdmin),
  };
}

export async function listPosts(
  viewer: Viewer,
  opts: { authorSub?: string; authorSubs?: string[]; before?: number; limit?: number; q?: string } = {},
): Promise<FeedItem[]> {
  const params: unknown[] = [viewer?.sub ?? ""];
  const where = ["p.parent_id IS NULL", "pr.banned = FALSE"];
  if (opts.authorSub) {
    params.push(opts.authorSub);
    where.push(`p.author_sub = $${params.length}`);
  }
  if (opts.authorSubs) {
    if (opts.authorSubs.length === 0) return [];
    params.push(opts.authorSubs);
    where.push(`p.author_sub = ANY($${params.length}::text[])`);
  }
  if (opts.before) {
    params.push(opts.before);
    where.push(`p.created_at < $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`p.body ILIKE $${params.length}`);
  }
  params.push(Math.min(opts.limit ?? 30, 100));
  const rows = await q(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY p.created_at DESC LIMIT $${params.length}`, params);
  return rows.map((r) => toItem(r, viewer));
}

export async function getThread(viewer: Viewer, id: string): Promise<{ post: FeedItem; parent: FeedItem | null; replies: FeedItem[] } | null> {
  const rows = await q(`${SELECT} WHERE p.id = $2 AND pr.banned = FALSE`, [viewer?.sub ?? "", id]);
  if (!rows[0]) return null;
  const post = toItem(rows[0], viewer);
  const replies = (await q(`${SELECT} WHERE p.parent_id = $2 AND pr.banned = FALSE ORDER BY p.created_at ASC LIMIT 200`, [viewer?.sub ?? "", id])).map(
    (r) => toItem(r, viewer),
  );
  let parent: FeedItem | null = null;
  if (post.parentId) {
    const up = await q(`${SELECT} WHERE p.id = $2`, [viewer?.sub ?? "", post.parentId]);
    if (up[0]) parent = toItem(up[0], viewer);
  }
  return { post, parent, replies };
}

export async function createPost(
  author: Profile,
  input: { body: string; parentId?: string | null; image?: string | null },
): Promise<{ id: string } | { error: string }> {
  if (author.muted) return { error: "Your Jace account is muted, so you can't post right now." };
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!body && !input.image) return { error: "Write something first." };
  if (body.length > MAX_POST) return { error: `Posts can be up to ${MAX_POST} characters.` };
  if (input.parentId) {
    const parent = await q(`SELECT id FROM posts WHERE id = $1`, [input.parentId]);
    if (!parent[0]) return { error: "That post was deleted." };
  }
  // Slow down floods: at most 10 posts a minute per account.
  const recent = await q(`SELECT count(*)::int AS n FROM posts WHERE author_sub = $1 AND created_at > $2`, [
    author.sub,
    Date.now() - 60_000,
  ]);
  if (Number(recent[0]?.n) >= 10) return { error: "You're posting very fast. Wait a minute and try again." };

  let imageId: string | null = null;
  if (input.image) {
    const saved = await saveImage(author.sub, input.image);
    if ("error" in saved) return saved;
    imageId = saved.id;
  }
  const id = randomUUID();
  await q(`INSERT INTO posts (id, author_sub, parent_id, body, image_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
    id,
    author.sub,
    input.parentId ?? null,
    body,
    imageId,
    Date.now(),
  ]);
  return { id };
}

export async function deletePost(viewer: { sub: string; isAdmin: boolean }, id: string): Promise<boolean> {
  const rows = await q(`SELECT author_sub, image_id FROM posts WHERE id = $1`, [id]);
  if (!rows[0] || (rows[0].author_sub !== viewer.sub && !viewer.isAdmin)) return false;
  await q(`DELETE FROM posts WHERE id = $1`, [id]);
  if (rows[0].image_id) await q(`DELETE FROM images WHERE id = $1`, [rows[0].image_id]);
  return true;
}

export async function setLike(sub: string, id: string, liked: boolean): Promise<{ likes: number; liked: boolean } | null> {
  const exists = await q(`SELECT id FROM posts WHERE id = $1`, [id]);
  if (!exists[0]) return null;
  if (liked) {
    await q(`INSERT INTO likes (post_id, sub, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, sub, Date.now()]);
  } else {
    await q(`DELETE FROM likes WHERE post_id = $1 AND sub = $2`, [id, sub]);
  }
  const n = await q(`SELECT count(*)::int AS n FROM likes WHERE post_id = $1`, [id]);
  return { likes: Number(n[0]?.n ?? 0), liked };
}

export async function postCount(sub: string): Promise<number> {
  const rows = await q(`SELECT count(*)::int AS n FROM posts WHERE author_sub = $1 AND parent_id IS NULL`, [sub]);
  return Number(rows[0]?.n ?? 0);
}
