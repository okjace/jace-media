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
    media?: { $type: string; images?: { thumb: string; fullsize: string; alt?: string }[]; thumbnail?: string };
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
  if (source?.thumbnail) media.push({ kind: "video", url: source.thumbnail, thumb: source.thumbnail });
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
  return data.hits
    .sort((a, b) => b.points - a.points)
    .map(
      (h): FeedItem => ({
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
      }),
    );
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

export const NETWORKS: Record<Exclude<Network, "jace">, { label: string; load: (limit?: number) => Promise<FeedItem[] | null>; site: string }> = {
  bluesky: { label: "Bluesky", load: bluesky, site: "https://bsky.app" },
  mastodon: { label: "Mastodon", load: mastodon, site: `https://${MASTODON}` },
  lemmy: { label: "Lemmy", load: lemmy, site: `https://${LEMMY}` },
  hackernews: { label: "Hacker News", load: hackerNews, site: "https://news.ycombinator.com" },
};
