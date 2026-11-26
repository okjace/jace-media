export type Visibility = "public" | "unlisted" | "private";

/** A Jace Media profile: the Jace handle, plus a name and picture that default to Jace's but can be changed just here. */
export type Profile = {
  sub: string;
  /** The Jace username. Always the same as on Jace. */
  handle: string;
  /** What's shown: the Jace Media name if set, otherwise the Jace display name. */
  name: string;
  /** What's shown: the Jace Media picture if set, otherwise the Jace picture. */
  picture: string | null;
  bio: string;
  /** The Jace values, for "reset to my Jace name/picture". */
  jaceName: string;
  jacePicture: string | null;
  customName: boolean;
  customPicture: boolean;
  isAdmin: boolean;
  muted: boolean;
};

/** One Jace account remembered on this device, as the account menu shows it. */
export type AccountSummary = {
  sub: string;
  handle: string;
  name: string;
  picture: string | null;
};

/** A video as Jace's videos API returns it (see Jace's /developers page). */
export type JaceVideo = {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail_url: string | null;
  content_type: string;
  size: number;
  visibility: Visibility;
  owner_id: string;
  owner_type: "user" | "org";
  owner_name: string;
  owner_picture: string | null;
  likes: number;
  comment_count: number;
  created_at: string;
};

export type JaceVideoDetail = JaceVideo & {
  liked_by_me: boolean;
  can_manage: boolean;
  comments: { id: string; body: string; author_id: string; author_name: string; pinned: boolean; created_at: string }[];
};

/** One card in a video grid, from either source. */
export type VideoCard = {
  source: "jace" | "youtube";
  id: string;
  title: string;
  thumbnail: string | null;
  channelId: string;
  channelName: string;
  channelPicture?: string | null;
  publishedAt: string | null;
  views?: number | null;
  /** ISO 8601 duration (YouTube) or null. */
  duration?: string | null;
  visibility?: Visibility;
  /** A Short (vertical, under a minute or so). */
  short?: boolean;
  /** The video file, for Jace videos (Shorts play it inline). */
  src?: string;
};

export type YouTubeVideoDetail = {
  id: string;
  title: string;
  description: string;
  channelId: string | null;
  channelName: string;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
};

export type Network = "jace" | "bluesky" | "mastodon" | "lemmy" | "hackernews" | "rss";

export type Media = { kind: "image" | "video"; url: string; thumb?: string | null; alt?: string };

/** A post from any network, in one shape so every tab can show it the same way. */
export type Poll = { options: string[]; counts: number[]; total: number; myVote: number | null; endsAt: string; ended: boolean };

export type FeedItem = {
  network: Network;
  id: string;
  author: { name: string; handle: string; picture: string | null; url: string | null };
  title?: string;
  text: string;
  /** The post on its own site (or on Jace Media for Jace posts). */
  url: string;
  /** A link the post shares (an article, for Hacker News and Lemmy). */
  link?: string | null;
  media: Media[];
  createdAt: string;
  stats: { likes?: number; replies?: number; reposts?: number; score?: number };
  /** Where it was posted: a Lemmy community, a Mastodon server. */
  place?: string | null;
  /** Jace posts only. */
  authorSub?: string;
  /** A quoted (or reposted) post, from any network. */
  quote?: FeedItem | null;
  /** Set when this is a plain repost: who reposted it, and the repost's own id. */
  repostedBy?: { name: string; handle: string; url: string; repostId: string; canDelete: boolean } | null;
  poll?: Poll | null;
  likedByMe?: boolean;
  canDelete?: boolean;
};
