import "server-only";
import type { FeedItem, Media, Network } from "./types";

/**
 * Posts from other social networks, read from their public APIs (no keys,
 * no accounts). Each is turned into a FeedItem so every tab shows posts the
 * same way. Anything marked adult or sensitive is left out. A network that
 * can't be reached just shows as empty with a note; it never breaks a page.
 */

const UA = "JaceMedia/0.1 (+https://github.com/okjace/jace-media)";
const REVALIDATE = 120;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error(`${new URL(url).host} answered ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`Couldn't reach ${new URL(url).host}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Mastodon and Hacker News send HTML; Jace Media only ever shows plain text. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

/**
 * No ads anywhere: posts that say they're ads, sponsored, or paid
 * partnerships are left out of every feed.
 */
const AD_MARKERS = /(^|[\s(])#(ad|ads|advert|advertisement|sponsored|sponsor|promo|promoted|paidpartnership|affiliate)\b|\b(paid partnership|sponsored post|sponsored content|promoted post|use (my )?code \w+ for \d+% off)\b/i;

export function isAd(text: string): boolean {
  return AD_MARKERS.test(text);
}

// ---------- Bluesky ----------

const BSKY = "https://public.api.bsky.app/xrpc";
const BSKY_HOT = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const ADULT_LABELS = new Set(["porn", "sexual", "nudity", "graphic-media", "gore", "!hide", "!warn"]);

type BskyLabel = { val: string };
type BskyPost = {
  uri: string;
  author: { did: string; handle: string; displayName?: string; avatar?: string; labels?: BskyLabel[] };
  record: { text?: string; createdAt?: string };
  embed?: {
    $type: string;
    images?: { thumb: string; fullsize: string; alt?: string }[];
    thumbnail?: string;
    playlist?: string;
    external?: { uri: string; title?: string; thumb?: string };
    media?: { $type: string; images?: { thumb: string; fullsize: string; alt?: string }[]; thumbnail?: string; playlist?: string };
  };
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  labels?: BskyLabel[];
};

function bskyMedia(embed: BskyPost["embed"]): { media: Media[]; link: string | null } {
  if (!embed) return { media: [], link: null };
  const source = embed.$type.startsWith("app.bsky.embed.recordWithMedia") ? embed.media : embed;
  const media: Media[] = [];
  for (const img of source?.images ?? []) media.push({ kind: "image", url: img.fullsize, thumb: img.thumb, alt: img.alt });
  if (source?.thumbnail) media.push({ kind: "video", url: source.thumbnail, thumb: source.thumbnail, src: source.playlist ?? null });
  return { media, link: embed.external?.uri ?? null };
}

function fromBsky(p: BskyPost): FeedItem | null {
  const labels = [...(p.labels ?? []), ...(p.author.labels ?? [])];
  if (labels.some((l) => ADULT_LABELS.has(l.val))) return null;
  if (isAd(p.record.text ?? "")) return null;
  const rkey = p.uri.split("/").pop();
  const { media, link } = bskyMedia(p.embed);
  return {
    network: "bluesky",
    id: p.uri,
    author: {
      name: p.author.displayName || p.author.handle,
      handle: `@${p.author.handle}`,
      picture: p.author.avatar ?? null,
      url: `https://bsky.app/profile/${p.author.handle}`,
    },
    text: p.record.text ?? "",
    url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
    link,
    media,
    createdAt: p.record.createdAt ?? new Date().toISOString(),
    stats: { likes: p.likeCount, replies: p.replyCount, reposts: p.repostCount },
  };
}

export async function bluesky(limit = 30): Promise<FeedItem[] | null> {
  const data = await getJson<{ feed: { post: BskyPost }[] }>(
    `${BSKY}/app.bsky.feed.getFeed?feed=${encodeURIComponent(BSKY_HOT)}&limit=${Math.min(limit, 100)}`,
  );
  if (!data) return null;
  return data.feed.map((f) => fromBsky(f.post)).filter((x): x is FeedItem => !!x);
}

// ---------- Mastodon ----------

const MASTODON = (process.env.MASTODON_SERVER || "mastodon.social").replace(/^https?:\/\//, "").replace(/\/$/, "");

type MastoStatus = {
  id: string;
  url: string | null;
  uri: string;
  created_at: string;
  content: string;
  sensitive: boolean;
  spoiler_text: string;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  account: { acct: string; display_name: string; avatar: string; url: string; bot?: boolean };
  media_attachments: { type: string; url: string; preview_url: string | null; description: string | null }[];
  card: { url: string } | null;
  reblog: MastoStatus | null;
};

function fromMastodon(s: MastoStatus): FeedItem | null {
  const status = s.reblog ?? s;
  if (status.sensitive || status.spoiler_text) return null;
  if (isAd(htmlToText(status.content))) return null;
  const acct = status.account.acct.includes("@") ? status.account.acct : `${status.account.acct}@${MASTODON}`;
  return {
    network: "mastodon",
    id: status.id,
    author: {
      name: htmlToText(status.account.display_name) || status.account.acct,
      handle: `@${acct}`,
      picture: status.account.avatar,
      url: status.account.url,
    },
    text: htmlToText(status.content),
    url: status.url ?? status.uri,
    link: status.card?.url ?? null,
    media: status.media_attachments
      .filter((m) => m.type === "image" || m.type === "gifv" || m.type === "video")
      .map((m) => ({
        kind: m.type === "image" ? ("image" as const) : ("video" as const),
        url: m.type === "image" ? m.url : (m.preview_url ?? m.url),
        thumb: m.preview_url,
        src: m.type === "image" ? null : m.url,
        alt: m.description ?? undefined,
      })),
    createdAt: status.created_at,
    stats: { likes: status.favourites_count, replies: status.replies_count, reposts: status.reblogs_count },
    place: MASTODON,
  };
}

export async function mastodon(limit = 30): Promise<FeedItem[] | null> {
  const data = await getJson<MastoStatus[]>(`https://${MASTODON}/api/v1/trends/statuses?limit=${Math.min(limit, 40)}`);
  if (!data) return null;
  return data.map(fromMastodon).filter((x): x is FeedItem => !!x);
}

// ---------- Lemmy ----------

const LEMMY = (process.env.LEMMY_SERVER || "lemmy.world").replace(/^https?:\/\//, "").replace(/\/$/, "");

type LemmyView = {
  post: {
    id: number;
    name: string;
    body?: string;
    url?: string;
    url_content_type?: string;
    thumbnail_url?: string;
    nsfw: boolean;
    published: string;
    ap_id: string;
  };
  creator: { name: string; display_name?: string; avatar?: string; actor_id: string };
  community: { name: string; title: string; nsfw: boolean; actor_id: string };
  counts: { score: number; comments: number; upvotes: number };
};

function fromLemmy(v: LemmyView): FeedItem | null {
  if (v.post.nsfw || v.community.nsfw) return null;
  if (isAd(`${v.post.name} ${v.post.body ?? ""}`)) return null;
  const isImage = !!v.post.url && (v.post.url_content_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(v.post.url));
  const media: Media[] = isImage
    ? [{ kind: "image", url: v.post.url!, thumb: v.post.thumbnail_url ?? v.post.url }]
    : v.post.thumbnail_url
      ? [{ kind: "image", url: v.post.thumbnail_url }]
      : [];
  const host = new URL(v.community.actor_id).host;
  return {
    network: "lemmy",
    id: String(v.post.id),
    author: {
      name: v.creator.display_name || v.creator.name,
      handle: `@${v.creator.name}@${new URL(v.creator.actor_id).host}`,
      picture: v.creator.avatar ?? null,
      url: v.creator.actor_id,
    },
    title: v.post.name,
    text: (v.post.body ?? "").slice(0, 1200),
    url: `https://${LEMMY}/post/${v.post.id}`,
    link: isImage ? null : (v.post.url ?? null),
    media,
    createdAt: v.post.published.endsWith("Z") ? v.post.published : `${v.post.published}Z`,
    stats: { score: v.counts.score, replies: v.counts.comments },
    place: `c/${v.community.name}@${host}`,
  };
}

export async function lemmy(limit = 30): Promise<FeedItem[] | null> {
  const data = await getJson<{ posts: LemmyView[] }>(
    `https://${LEMMY}/api/v3/post/list?sort=Hot&type_=All&limit=${Math.min(limit, 50)}`,
  );
  if (!data) return null;
  return data.posts.map(fromLemmy).filter((x): x is FeedItem => !!x);
}

// ---------- Hacker News ----------

type HnHit = {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text?: string | null;
};

export async function hackerNews(limit = 30): Promise<FeedItem[] | null> {
  const data = await getJson<{ hits: HnHit[] }>(
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${Math.min(limit, 50)}`,
  );
  if (!data) return null;
  return data.hits.sort((a, b) => b.points - a.points).map(fromHn);
}

function fromHn(h: HnHit): FeedItem {
  return {
    network: "hackernews",
    id: h.objectID,
    author: { name: h.author, handle: h.author, picture: null, url: `https://news.ycombinator.com/user?id=${h.author}` },
    title: h.title,
    text: h.story_text ? htmlToText(h.story_text).slice(0, 800) : "",
    url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    link: h.url,
    media: [],
    createdAt: h.created_at,
    stats: { score: h.points, replies: h.num_comments },
    place: h.url ? new URL(h.url).host.replace(/^www\./, "") : null,
  };
}

// ---------- Following one account or community ----------

/** A Bluesky person's newest posts. */
export async function blueskyAuthor(handle: string, limit = 10): Promise<FeedItem[]> {
  const data = await getJson<{ feed: { post: BskyPost; reason?: unknown }[] }>(
    `${BSKY}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${limit}&filter=posts_no_replies`,
  );
  return (data?.feed ?? []).filter((f) => !f.reason).map((f) => fromBsky(f.post)).filter((x): x is FeedItem => !!x);
}

/** A Mastodon person's newest posts (user@server), looked up through MASTODON_SERVER. */
export async function mastodonAuthor(acct: string, limit = 10): Promise<FeedItem[]> {
  const account = await getJson<{ id: string }>(`https://${MASTODON}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`);
  if (!account?.id) return [];
  const data = await getJson<MastoStatus[]>(
    `https://${MASTODON}/api/v1/accounts/${encodeURIComponent(account.id)}/statuses?limit=${limit}&exclude_replies=true`,
  );
  return (data ?? []).map(fromMastodon).filter((x): x is FeedItem => !!x);
}

/** A Lemmy community's hot posts (name@server). */
export async function lemmyCommunity(community: string, limit = 10): Promise<FeedItem[]> {
  const data = await getJson<{ posts: LemmyView[] }>(
    `https://${LEMMY}/api/v3/post/list?community_name=${encodeURIComponent(community)}&sort=Hot&limit=${limit}`,
  );
  return (data?.posts ?? []).map(fromLemmy).filter((x): x is FeedItem => !!x);
}

export const NETWORKS: Record<Exclude<Network, "jace" | "rss">, { label: string; load: (limit?: number) => Promise<FeedItem[] | null>; site: string }> = {
  bluesky: { label: "Bluesky", load: bluesky, site: "https://bsky.app" },
  mastodon: { label: "Mastodon", load: mastodon, site: `https://${MASTODON}` },
  lemmy: { label: "Lemmy", load: lemmy, site: `https://${LEMMY}` },
  hackernews: { label: "Hacker News", load: hackerNews, site: "https://news.ycombinator.com" },
};

// ---------- Profiles and threads, shown natively in Jace Media ----------

export type ExtNetwork = "bluesky" | "mastodon" | "lemmy" | "lemmy-user" | "hackernews";

export type ExtProfile = {
  network: ExtNetwork;
  name: string;
  handle: string;
  picture: string | null;
  banner: string | null;
  bio: string;
  stats: { label: string; value: number }[];
  /** The profile on its own site. */
  url: string;
  /** What Follow saves (none for Hacker News and Lemmy people). */
  follow: { kind: "bluesky" | "mastodon" | "lemmy"; ref: string; name: string; picture: string | null } | null;
};

export async function blueskyProfile(handle: string): Promise<{ profile: ExtProfile; posts: FeedItem[] } | null> {
  const [p, posts] = await Promise.all([
    getJson<{ handle: string; displayName?: string; avatar?: string; banner?: string; description?: string; followersCount?: number; followsCount?: number; postsCount?: number; labels?: BskyLabel[] }>(
      `${BSKY}/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`,
    ),
    blueskyAuthor(handle, 30),
  ]);
  if (!p) return null;
  if ((p.labels ?? []).some((l) => ADULT_LABELS.has(l.val))) return null;
  return {
    profile: {
      network: "bluesky",
      name: p.displayName || p.handle,
      handle: `@${p.handle}`,
      picture: p.avatar ?? null,
      banner: p.banner ?? null,
      bio: p.description ?? "",
      stats: [
        { label: "followers", value: p.followersCount ?? 0 },
        { label: "following", value: p.followsCount ?? 0 },
        { label: "posts", value: p.postsCount ?? 0 },
      ],
      url: `https://bsky.app/profile/${p.handle}`,
      follow: { kind: "bluesky", ref: p.handle, name: p.displayName || p.handle, picture: p.avatar ?? null },
    },
    posts,
  };
}

export async function mastodonProfile(acct: string): Promise<{ profile: ExtProfile; posts: FeedItem[] } | null> {
  const a = await getJson<{
    id: string;
    acct: string;
    display_name: string;
    avatar: string;
    header: string;
    note: string;
    url: string;
    followers_count: number;
    following_count: number;
    statuses_count: number;
  }>(`https://${MASTODON}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`);
  if (!a?.id) return null;
  const statuses = await getJson<MastoStatus[]>(`https://${MASTODON}/api/v1/accounts/${encodeURIComponent(a.id)}/statuses?limit=30&exclude_replies=true`);
  const full = a.acct.includes("@") ? a.acct : `${a.acct}@${MASTODON}`;
  return {
    profile: {
      network: "mastodon",
      name: htmlToText(a.display_name) || a.acct,
      handle: `@${full}`,
      picture: a.avatar,
      banner: a.header && !a.header.includes("missing") ? a.header : null,
      bio: htmlToText(a.note),
      stats: [
        { label: "followers", value: a.followers_count },
        { label: "following", value: a.following_count },
        { label: "posts", value: a.statuses_count },
      ],
      url: a.url,
      follow: { kind: "mastodon", ref: full, name: htmlToText(a.display_name) || a.acct, picture: a.avatar },
    },
    posts: (statuses ?? []).map(fromMastodon).filter((x): x is FeedItem => !!x),
  };
}

export async function lemmyCommunityProfile(name: string): Promise<{ profile: ExtProfile; posts: FeedItem[] } | null> {
  const [c, posts] = await Promise.all([
    getJson<{
      community_view: {
        community: { name: string; title: string; description?: string; icon?: string; banner?: string; actor_id: string; nsfw: boolean };
        counts: { subscribers: number; posts: number; comments: number };
      };
    }>(`https://${LEMMY}/api/v3/community?name=${encodeURIComponent(name)}`),
    lemmyCommunity(name, 30),
  ]);
  const cv = c?.community_view;
  if (!cv || cv.community.nsfw) return null;
  const host = new URL(cv.community.actor_id).host;
  const ref = `${cv.community.name}@${host}`;
  return {
    profile: {
      network: "lemmy",
      name: cv.community.title,
      handle: `c/${ref}`,
      picture: cv.community.icon ?? null,
      banner: cv.community.banner ?? null,
      bio: cv.community.description ?? "",
      stats: [
        { label: "members", value: cv.counts.subscribers },
        { label: "posts", value: cv.counts.posts },
      ],
      url: cv.community.actor_id,
      follow: { kind: "lemmy", ref, name: `c/${ref}`, picture: cv.community.icon ?? null },
    },
    posts,
  };
}

export async function lemmyUserProfile(username: string): Promise<{ profile: ExtProfile; posts: FeedItem[] } | null> {
  const u = await getJson<{
    person_view: { person: { name: string; display_name?: string; avatar?: string; banner?: string; bio?: string; actor_id: string }; counts: { post_count: number; comment_count: number } };
    posts: LemmyView[];
  }>(`https://${LEMMY}/api/v3/user?username=${encodeURIComponent(username)}&limit=30&sort=New`);
  if (!u?.person_view) return null;
  const p = u.person_view.person;
  return {
    profile: {
      network: "lemmy-user",
      name: p.display_name || p.name,
      handle: `@${p.name}@${new URL(p.actor_id).host}`,
      picture: p.avatar ?? null,
      banner: p.banner ?? null,
      bio: p.bio ?? "",
      stats: [
        { label: "posts", value: u.person_view.counts.post_count },
        { label: "comments", value: u.person_view.counts.comment_count },
      ],
      url: p.actor_id,
      follow: null,
    },
    posts: (u.posts ?? []).map(fromLemmy).filter((x): x is FeedItem => !!x),
  };
}

export async function hnUserProfile(id: string): Promise<{ profile: ExtProfile; posts: FeedItem[] } | null> {
  const [u, stories] = await Promise.all([
    getJson<{ username: string; about?: string; karma: number }>(`https://hn.algolia.com/api/v1/users/${encodeURIComponent(id)}`),
    getJson<{ hits: HnHit[] }>(`https://hn.algolia.com/api/v1/search_by_date?tags=story,author_${encodeURIComponent(id)}&hitsPerPage=30`),
  ]);
  if (!u?.username) return null;
  return {
    profile: {
      network: "hackernews",
      name: u.username,
      handle: u.username,
      picture: null,
      banner: null,
      bio: u.about ? htmlToText(u.about) : "",
      stats: [{ label: "karma", value: u.karma }],
      url: `https://news.ycombinator.com/user?id=${u.username}`,
      follow: null,
    },
    posts: (stories?.hits ?? []).map(fromHn),
  };
}

/** A reply in a thread, with how deep it sits (0 = a direct reply). */
export type ThreadReply = { item: FeedItem; depth: number };
export type Thread = { post: FeedItem; replies: ThreadReply[] };
const MAX_REPLIES = 200;

type BskyThreadNode = { $type?: string; post?: BskyPost; replies?: BskyThreadNode[] };

export async function blueskyThread(uri: string): Promise<Thread | null> {
  const data = await getJson<{ thread: BskyThreadNode }>(`${BSKY}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=6&parentHeight=0`);
  const root = data?.thread?.post ? fromBsky(data.thread.post) : null;
  if (!root) return null;
  const replies: ThreadReply[] = [];
  const walk = (nodes: BskyThreadNode[] | undefined, depth: number) => {
    for (const n of nodes ?? []) {
      if (replies.length >= MAX_REPLIES || !n.post) continue;
      const item = fromBsky(n.post);
      if (item) replies.push({ item, depth });
      walk(n.replies, depth + 1);
    }
  };
  walk(data!.thread.replies, 0);
  return { post: root, replies };
}

export async function mastodonThread(id: string): Promise<Thread | null> {
  const [status, context] = await Promise.all([
    getJson<MastoStatus>(`https://${MASTODON}/api/v1/statuses/${encodeURIComponent(id)}`),
    getJson<{ descendants: (MastoStatus & { in_reply_to_id: string | null })[] }>(`https://${MASTODON}/api/v1/statuses/${encodeURIComponent(id)}/context`),
  ]);
  const post = status ? fromMastodon(status) : null;
  if (!post) return null;
  const depthOf = new Map<string, number>([[id, -1]]);
  const replies: ThreadReply[] = [];
  for (const d of context?.descendants ?? []) {
    const depth = (depthOf.get(d.in_reply_to_id ?? id) ?? -1) + 1;
    depthOf.set(d.id, depth);
    const item = fromMastodon(d);
    if (item && replies.length < MAX_REPLIES) replies.push({ item, depth });
  }
  return { post, replies };
}

type LemmyCommentView = {
  comment: { id: number; content: string; published: string; path: string; deleted: boolean; removed: boolean };
  creator: { name: string; display_name?: string; avatar?: string; actor_id: string };
  counts: { score: number; child_count: number };
};

export async function lemmyThread(id: string): Promise<Thread | null> {
  if (!/^\d+$/.test(id)) return null;
  const [p, c] = await Promise.all([
    getJson<{ post_view: LemmyView }>(`https://${LEMMY}/api/v3/post?id=${id}`),
    getJson<{ comments: LemmyCommentView[] }>(`https://${LEMMY}/api/v3/comment/list?post_id=${id}&sort=Hot&max_depth=6&limit=50&type_=All`),
  ]);
  const post = p?.post_view ? fromLemmy(p.post_view) : null;
  if (!post) return null;
  // Comments come flat with a path ("0.12.34"); order them as a tree.
  const comments = (c?.comments ?? []).filter((x) => !x.comment.deleted && !x.comment.removed && !isAd(x.comment.content));
  comments.sort((a, b) => a.comment.path.localeCompare(b.comment.path, undefined, { numeric: true }));
  const replies = comments.slice(0, MAX_REPLIES).map(
    (x): ThreadReply => ({
      depth: x.comment.path.split(".").length - 2,
      item: {
        network: "lemmy",
        id: String(x.comment.id),
        author: {
          name: x.creator.display_name || x.creator.name,
          handle: `@${x.creator.name}@${new URL(x.creator.actor_id).host}`,
          picture: x.creator.avatar ?? null,
          url: x.creator.actor_id,
        },
        text: x.comment.content,
        url: `https://${LEMMY}/comment/${x.comment.id}`,
        media: [],
        createdAt: x.comment.published.endsWith("Z") ? x.comment.published : `${x.comment.published}Z`,
        stats: { score: x.counts.score },
      },
    }),
  );
  return { post, replies };
}

type HnItem = { id: number; author: string | null; title?: string | null; text?: string | null; url?: string | null; points?: number | null; created_at: string; children: HnItem[] };

export async function hnThread(id: string): Promise<Thread | null> {
  if (!/^\d+$/.test(id)) return null;
  const item = await getJson<HnItem>(`https://hn.algolia.com/api/v1/items/${id}`);
  if (!item) return null;
  const count = (n: HnItem): number => n.children.reduce((sum, c) => sum + 1 + count(c), 0);
  const post: FeedItem = {
    network: "hackernews",
    id: String(item.id),
    author: { name: item.author ?? "[deleted]", handle: item.author ?? "", picture: null, url: null },
    title: item.title ?? undefined,
    text: item.text ? htmlToText(item.text) : "",
    url: `https://news.ycombinator.com/item?id=${item.id}`,
    link: item.url ?? null,
    media: [],
    createdAt: item.created_at,
    stats: { score: item.points ?? 0, replies: count(item) },
    place: item.url ? new URL(item.url).host.replace(/^www\./, "") : null,
  };
  const replies: ThreadReply[] = [];
  const walk = (nodes: HnItem[], depth: number) => {
    for (const n of nodes) {
      if (replies.length >= MAX_REPLIES) return;
      if (n.author && n.text) {
        replies.push({
          depth,
          item: {
            network: "hackernews",
            id: String(n.id),
            author: { name: n.author, handle: n.author, picture: null, url: null },
            text: htmlToText(n.text),
            url: `https://news.ycombinator.com/item?id=${n.id}`,
            media: [],
            createdAt: n.created_at,
            stats: {},
          },
        });
      }
      walk(n.children ?? [], depth + 1);
    }
  };
  walk(item.children ?? [], 0);
  return { post, replies };
}

// ---------- Search ----------

export type PersonResult = { network: ExtNetwork; name: string; handle: string; picture: string | null; href: string; blurb: string };

export async function searchBluesky(query: string, limit = 20): Promise<FeedItem[] | null> {
  const data = await getJson<{ posts: BskyPost[] }>(
    `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${limit}&sort=top`,
  );
  return data ? data.posts.map(fromBsky).filter((x): x is FeedItem => !!x) : null;
}

export async function searchMastodon(query: string, limit = 20): Promise<FeedItem[] | null> {
  const [found, tagged] = await Promise.all([
    getJson<{ statuses: MastoStatus[] }>(`https://${MASTODON}/api/v2/search?q=${encodeURIComponent(query)}&type=statuses&limit=${limit}`),
    /^[\p{L}\p{N}_]+$/u.test(query.replace(/^#/, ""))
      ? getJson<MastoStatus[]>(`https://${MASTODON}/api/v1/timelines/tag/${encodeURIComponent(query.replace(/^#/, ""))}?limit=${limit}`)
      : Promise.resolve([] as MastoStatus[]),
  ]);
  if (!found && !tagged) return null;
  return [...(found?.statuses ?? []), ...(tagged ?? [])].map(fromMastodon).filter((x): x is FeedItem => !!x);
}

export async function searchLemmy(query: string, limit = 20): Promise<FeedItem[] | null> {
  const data = await getJson<{ posts: LemmyView[] }>(
    `https://${LEMMY}/api/v3/search?q=${encodeURIComponent(query)}&type_=Posts&sort=TopYear&limit=${limit}`,
  );
  return data ? data.posts.map(fromLemmy).filter((x): x is FeedItem => !!x) : null;
}

export async function searchHackerNews(query: string, limit = 20): Promise<FeedItem[] | null> {
  const data = await getJson<{ hits: HnHit[] }>(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`);
  return data ? data.hits.filter((h) => h.title).map(fromHn) : null;
}

/** People and communities matching a search, from Bluesky, Mastodon, and Lemmy. */
export async function searchPeople(query: string, networks: string[]): Promise<PersonResult[]> {
  const enc = encodeURIComponent(query);
  const [b, m, l] = await Promise.all([
    networks.includes("bluesky")
      ? getJson<{ actors: { handle: string; displayName?: string; avatar?: string; description?: string; labels?: BskyLabel[] }[] }>(
          `${BSKY}/app.bsky.actor.searchActors?q=${enc}&limit=6`,
        )
      : null,
    networks.includes("mastodon")
      ? getJson<{ accounts: { acct: string; display_name: string; avatar: string; note: string }[] }>(
          `https://${MASTODON}/api/v2/search?q=${enc}&type=accounts&limit=6`,
        )
      : null,
    networks.includes("lemmy")
      ? getJson<{ communities: { community: { name: string; title: string; icon?: string; actor_id: string; nsfw: boolean; description?: string } }[] }>(
          `https://${LEMMY}/api/v3/search?q=${enc}&type_=Communities&sort=TopAll&limit=6`,
        )
      : null,
  ]);
  const out: PersonResult[] = [];
  for (const a of b?.actors ?? []) {
    if ((a.labels ?? []).some((x) => ADULT_LABELS.has(x.val))) continue;
    out.push({ network: "bluesky", name: a.displayName || a.handle, handle: `@${a.handle}`, picture: a.avatar ?? null, href: `/channel/bluesky/${a.handle}`, blurb: (a.description ?? "").slice(0, 120) });
  }
  for (const a of m?.accounts ?? []) {
    const acct = a.acct.includes("@") ? a.acct : `${a.acct}@${MASTODON}`;
    out.push({ network: "mastodon", name: htmlToText(a.display_name) || a.acct, handle: `@${acct}`, picture: a.avatar, href: `/channel/mastodon/${encodeURIComponent(acct)}`, blurb: htmlToText(a.note).slice(0, 120) });
  }
  for (const { community: c } of l?.communities ?? []) {
    if (c.nsfw) continue;
    const ref = `${c.name}@${new URL(c.actor_id).host}`;
    out.push({ network: "lemmy", name: c.title, handle: `c/${ref}`, picture: c.icon ?? null, href: `/channel/lemmy/${encodeURIComponent(ref)}`, blurb: (c.description ?? "").slice(0, 120) });
  }
  return out;
}
