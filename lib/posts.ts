import "server-only";
import { randomUUID } from "crypto";
import { q } from "./db";
import { notify } from "./notifications";
import { saveImage, toProfile } from "./profiles";
import { isOwnJaceUpload } from "./jaceStorage";
import type { FeedItem, Poll, PostVideo, Profile } from "./types";

/** Jace posts: what people post on Jace Media itself, with likes, replies, reposts, quotes, and polls. */

export const MAX_POST = 3000;
const POLL_DAYS = [1, 3, 7];

type Viewer = { sub: string; isAdmin: boolean } | null;

const SELECT = `
  SELECT p.id, p.parent_id, p.body, p.image_id, p.image_url, p.video, p.created_at, p.author_sub, p.quote, p.poll,
    pr.sub, pr.handle, pr.jace_name, pr.jace_picture, pr.display_name, pr.avatar_id, pr.bio, pr.is_admin, pr.muted,
    (SELECT count(*) FROM likes l WHERE l.post_id = p.id)::int AS like_count,
    (SELECT count(*) FROM posts r WHERE r.parent_id = p.id)::int AS reply_count,
    (SELECT count(*) FROM posts r WHERE r.quote_key = 'jace:' || p.id)::int AS repost_count,
    EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.sub = $1) AS liked,
    (SELECT json_agg(json_build_object('o', v.option, 'n', v.n)) FROM
      (SELECT option, count(*)::int AS n FROM poll_votes WHERE post_id = p.id GROUP BY option) v) AS poll_counts,
    (SELECT option FROM poll_votes WHERE post_id = p.id AND sub = $1) AS my_vote
  FROM posts p JOIN profiles pr ON pr.sub = p.author_sub
`;

function json<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

function toPoll(r: Record<string, unknown>): Poll | null {
  const poll = json<{ options: string[]; endsAt: number }>(r.poll);
  if (!poll?.options?.length) return null;
  const counts = poll.options.map(() => 0);
  for (const c of json<{ o: number; n: number }[]>(r.poll_counts) ?? []) if (c.o >= 0 && c.o < counts.length) counts[c.o] = Number(c.n);
  return {
    options: poll.options,
    counts,
    total: counts.reduce((a, b) => a + b, 0),
    myVote: r.my_vote === null || r.my_vote === undefined ? null : Number(r.my_vote),
    endsAt: new Date(poll.endsAt).toISOString(),
    ended: Date.now() > poll.endsAt,
  };
}

function toItem(r: Record<string, unknown>, viewer: Viewer): FeedItem & { parentId: string | null } {
  const author: Profile = toProfile(r);
  const canDelete = !!viewer && (viewer.sub === r.author_sub || viewer.isAdmin);
  const quote = json<FeedItem>(r.quote);
  const body = r.body as string;
  const self = {
    name: author.name,
    handle: author.handle,
    picture: author.picture,
    url: `/u/${encodeURIComponent(author.handle)}`,
  };
  // A plain repost shows the original post, with who reposted it on top.
  if (quote && !body && !r.image_id && !r.image_url && !r.video && !r.poll) {
    return {
      ...quote,
      parentId: null,
      repostedBy: { name: author.name, handle: author.handle, url: self.url, repostId: r.id as string, canDelete },
    };
  }
  return {
    network: "jace",
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    author: self,
    text: body,
    url: `/post/${r.id}`,
    media: r.image_url ? [{ kind: "image", url: r.image_url as string }] : r.image_id ? [{ kind: "image", url: `/api/images/${r.image_id}` }] : [],
    video: json<PostVideo>(r.video),
    createdAt: new Date(Number(r.created_at)).toISOString(),
    stats: { likes: Number(r.like_count), replies: Number(r.reply_count), reposts: Number(r.repost_count) },
    authorSub: r.author_sub as string,
    quote,
    poll: toPoll(r),
    likedByMe: !!r.liked,
    canDelete,
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

export async function getPost(viewer: Viewer, id: string): Promise<FeedItem | null> {
  const rows = await q(`${SELECT} WHERE p.id = $2 AND pr.banned = FALSE`, [viewer?.sub ?? "", id]);
  return rows[0] ? toItem(rows[0], viewer) : null;
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

export type NewPost = {
  body: string;
  parentId?: string | null;
  image?: string | null;
  /** A picture already uploaded to your folder on Jace's storage. */
  imageUrl?: string | null;
  /** A video for the post (already checked by the caller). */
  video?: PostVideo | null;
  /** The post being quoted or reposted, already fetched by the server (never trusted from the browser). */
  quote?: FeedItem | null;
  poll?: { options: string[]; days: number } | null;
};

export async function createPost(author: Profile, input: NewPost): Promise<{ id: string } | { error: string }> {
  if (author.muted) return { error: "Your Jace account is muted, so you can't post right now." };
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!body && !input.image && !input.imageUrl && !input.quote && !input.video) return { error: "Write something first." };
  if (input.imageUrl && !isOwnJaceUpload(input.imageUrl, author.sub)) return { error: "That picture can't be used." };
  if (body.length > MAX_POST) return { error: `Posts can be up to ${MAX_POST} characters.` };

  let parentAuthor: string | null = null;
  if (input.parentId) {
    const parent = await q(`SELECT author_sub FROM posts WHERE id = $1`, [input.parentId]);
    if (!parent[0]) return { error: "That post was deleted." };
    parentAuthor = parent[0].author_sub as string;
  }

  let poll: string | null = null;
  if (input.poll) {
    const options = input.poll.options.map((o) => o.replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean);
    if (options.length < 2 || options.length > 4) return { error: "Polls need 2 to 4 choices." };
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: "Each poll choice must be different." };
    const days = POLL_DAYS.includes(input.poll.days) ? input.poll.days : 1;
    poll = JSON.stringify({ options, endsAt: Date.now() + days * 86_400_000 });
  }

  // Slow down floods: at most 10 posts a minute per account.
  const recent = await q(`SELECT count(*)::int AS n FROM posts WHERE author_sub = $1 AND created_at > $2`, [author.sub, Date.now() - 60_000]);
  if (Number(recent[0]?.n) >= 10) return { error: "You're posting very fast. Wait a minute and try again." };

  const quoteKey = input.quote ? `${input.quote.network}:${input.quote.id}` : null;
  if (quoteKey && !body && !input.image && !input.imageUrl && !input.video && !poll) {
    // Reposting the same thing twice does nothing.
    const again = await q(`SELECT id FROM posts WHERE author_sub = $1 AND quote_key = $2 AND body = ''`, [author.sub, quoteKey]);
    if (again[0]) return { id: again[0].id as string };
  }

  let imageId: string | null = null;
  if (input.image) {
    const saved = await saveImage(author.sub, input.image);
    if ("error" in saved) return saved;
    imageId = saved.id;
  }
  const id = randomUUID();
  // A quote never nests another quote (keeps snapshots small).
  const snapshot = input.quote ? JSON.stringify({ ...input.quote, quote: null, repostedBy: null, likedByMe: false, canDelete: false }) : null;
  await q(
    `INSERT INTO posts (id, author_sub, parent_id, body, image_id, image_url, video, quote, quote_key, poll, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      author.sub,
      input.parentId ?? null,
      body,
      imageId,
      input.imageUrl ?? null,
      input.video ? JSON.stringify(input.video) : null,
      snapshot,
      quoteKey,
      poll,
      Date.now(),
    ],
  );

  if (parentAuthor) await notify(parentAuthor, "reply", author.sub, id);
  if (input.quote?.network === "jace" && input.quote.authorSub) {
    await notify(input.quote.authorSub, body || imageId || input.imageUrl || input.video || poll ? "quote" : "repost", author.sub, body || imageId || input.imageUrl || input.video || poll ? id : input.quote.id);
  }
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
  const exists = await q(`SELECT author_sub FROM posts WHERE id = $1`, [id]);
  if (!exists[0]) return null;
  if (liked) {
    const added = await q(`INSERT INTO likes (post_id, sub, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING post_id`, [id, sub, Date.now()]);
    if (added[0]) await notify(exists[0].author_sub as string, "like", sub, id);
  } else {
    await q(`DELETE FROM likes WHERE post_id = $1 AND sub = $2`, [id, sub]);
  }
  const n = await q(`SELECT count(*)::int AS n FROM likes WHERE post_id = $1`, [id]);
  return { likes: Number(n[0]?.n ?? 0), liked };
}

/** Votes in a poll (once; open polls only). */
export async function vote(sub: string, id: string, option: number): Promise<Poll | { error: string }> {
  const rows = await q(`SELECT poll FROM posts WHERE id = $1`, [id]);
  const poll = json<{ options: string[]; endsAt: number }>(rows[0]?.poll);
  if (!poll) return { error: "That poll was deleted." };
  if (Date.now() > poll.endsAt) return { error: "This poll has ended." };
  if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) return { error: "Pick a choice." };
  await q(`INSERT INTO poll_votes (post_id, sub, option, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (post_id, sub) DO NOTHING`, [id, sub, option, Date.now()]);
  const post = await getPost({ sub, isAdmin: false }, id);
  return post?.poll ?? { error: "That poll was deleted." };
}

export async function postCount(sub: string): Promise<number> {
  const rows = await q(`SELECT count(*)::int AS n FROM posts WHERE author_sub = $1 AND parent_id IS NULL`, [sub]);
  return Number(rows[0]?.n ?? 0);
}
