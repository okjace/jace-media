import "server-only";

/**
 * The database: Postgres (Neon on Vercel, via DATABASE_URL, over Neon's
 * HTTP driver; any other Postgres URL uses postgres.js). Without
 * DATABASE_URL, local development uses PGlite, a real Postgres compiled to
 * WebAssembly and kept in ./data/pglite. Both run the same SQL.
 */

type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS profiles (
    sub TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    jace_name TEXT NOT NULL,
    jace_picture TEXT,
    display_name TEXT,
    avatar_id TEXT,
    bio TEXT NOT NULL DEFAULT '',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    banned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS profiles_handle ON profiles (lower(handle))`,
  `CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    mime TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_sub TEXT NOT NULL REFERENCES profiles(sub) ON DELETE CASCADE,
    parent_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    image_id TEXT,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS posts_feed ON posts (created_at DESC) WHERE parent_id IS NULL`,
  `CREATE INDEX IF NOT EXISTS posts_parent ON posts (parent_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS posts_author ON posts (author_sub, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    sub TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (post_id, sub)
  )`,
  // Which services someone wants to see (a JSON list); null means all of them.
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS services TEXT`,
  // Which extensions are on (a JSON object, see lib/extensions.ts).
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extensions TEXT`,
  // Channels, people and communities someone follows, on any service.
  // kind: youtube (channel id), jace (Jace user id), bluesky (handle), mastodon (user@server), lemmy (community@server).
  `CREATE TABLE IF NOT EXISTS subscriptions (
    sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (sub, kind, ref)
  )`,
  // What someone watched (here, or imported from YouTube). One row per video.
  `CREATE TABLE IF NOT EXISTS watch_history (
    sub TEXT NOT NULL,
    source TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_id TEXT,
    channel_name TEXT,
    watch_count INT NOT NULL DEFAULT 1,
    watched_at BIGINT NOT NULL,
    PRIMARY KEY (sub, source, video_id)
  )`,
  `CREATE INDEX IF NOT EXISTS watch_history_recent ON watch_history (sub, watched_at DESC)`,
  `CREATE TABLE IF NOT EXISTS video_likes (
    sub TEXT NOT NULL,
    source TEXT NOT NULL,
    video_id TEXT NOT NULL,
    channel_id TEXT,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (sub, source, video_id)
  )`,
  // "Not interested" (kind video) and "Don't recommend channel" (kind channel).
  `CREATE TABLE IF NOT EXISTS hidden (
    sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (sub, kind, ref)
  )`,
  `CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    name TEXT NOT NULL,
    rules TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS feeds_owner ON feeds (sub, created_at)`,
  // Subscription folders ("Gaming", "Music", …); null means no folder.
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS folder TEXT`,
  // Jace Media comments on posts from other networks (Bluesky, Mastodon, …).
  `CREATE TABLE IF NOT EXISTS ext_comments (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    post_id TEXT NOT NULL,
    author_sub TEXT NOT NULL REFERENCES profiles(sub) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ext_comments_post ON ext_comments (network, post_id, created_at)`,
  // Appropriate (1) / inappropriate (-1) ratings of any post or video ("bluesky:<uri>", "youtube:<id>", …).
  `CREATE TABLE IF NOT EXISTS content_ratings (
    sub TEXT NOT NULL,
    target TEXT NOT NULL,
    rating SMALLINT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (sub, target)
  )`,
  `CREATE INDEX IF NOT EXISTS content_ratings_target ON content_ratings (target)`,
  // Where you stopped in a video, for Continue watching (seconds).
  `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS position REAL`,
  `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS duration REAL`,
  `ALTER TABLE watch_history ADD COLUMN IF NOT EXISTS thumbnail TEXT`,
  // Playlists; kind "watch_later" is each person's Watch Later.
  `CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'playlist',
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS playlists_owner ON playlists (sub, created_at)`,
  `CREATE TABLE IF NOT EXISTS playlist_items (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_id TEXT,
    channel_name TEXT,
    thumbnail TEXT,
    short BOOLEAN NOT NULL DEFAULT FALSE,
    added_at BIGINT NOT NULL,
    PRIMARY KEY (playlist_id, source, video_id)
  )`,
  // Reposts and quotes: a snapshot of the original post (any network), and its key ("jace:<id>", "bluesky:<uri>", …).
  // 1 = like, -1 = dislike (older rows are all likes).
  `ALTER TABLE video_likes ADD COLUMN IF NOT EXISTS value SMALLINT NOT NULL DEFAULT 1`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS quote TEXT`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS quote_key TEXT`,
  `CREATE INDEX IF NOT EXISTS posts_quote_key ON posts (quote_key)`,
  // Polls: {"options": [...], "endsAt": ms}.
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll TEXT`,
  `CREATE TABLE IF NOT EXISTS poll_votes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    sub TEXT NOT NULL,
    option INT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (post_id, sub)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    actor_sub TEXT NOT NULL,
    post_id TEXT,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notifications_inbox ON notifications (sub, created_at DESC)`,
];

// One connection per process. Next.js can load this module more than once
// (pages and API routes are bundled separately), and two PGlite copies on the
// same folder would each see only their own writes.
const shared = globalThis as typeof globalThis & { __jaceMediaDb?: Promise<Query> | null };
let ready: Promise<Query> | null = shared.__jaceMediaDb ?? null;

async function connect(): Promise<Query> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let query: Query;
  if (url && /\.neon\.tech/.test(url)) {
    // Neon over HTTP: one quick round trip per query, no connection to open on each cold start.
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    query = async (text, params = []) => (await sql.query(text, params)) as Record<string, unknown>[];
  } else if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
      onnotice: () => {},
    });
    query = async (text, params = []) =>
      (await sql.unsafe(text, params as never[])) as unknown as Record<string, unknown>[];
  } else {
    if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Add Neon from Vercel → Storage.");
    // Kept out of the static import graph so Vercel never bundles PGlite.
    const name = "@electric-sql/pglite";
    const { PGlite } = (await import(/* webpackIgnore: true */ name)) as typeof import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR || "./data/pglite";
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    query = async (text, params = []) => (await db.query(text, params)).rows as Record<string, unknown>[];
  }
  for (const statement of SCHEMA) await query(statement);
  return query;
}

export async function db(): Promise<Query> {
  ready ??= shared.__jaceMediaDb ?? null;
  if (!ready) {
    ready = connect();
    shared.__jaceMediaDb = ready;
    ready.catch(() => {
      ready = null;
      shared.__jaceMediaDb = null;
    });
  }
  return ready;
}

export async function q(text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  return (await db())(text, params);
}
