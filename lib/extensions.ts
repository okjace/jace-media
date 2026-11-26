import type { SegmentCategory } from "./segments";

/**
 * Extensions: optional features people switch on and off on the Extensions
 * page. Saved to the account (or this device when signed out), and read by
 * both the server (what to show) and the player (how to play).
 */

export type ExtensionId =
  | "sponsorblock"
  | "dislikes"
  | "dearrow"
  | "privacy"
  | "hideShorts"
  | "hideWatched"
  | "focus"
  | "autoplayNext"
  | "resume"
  | "rememberSpeed"
  | "ambient"
  | "hideCounts"
  | "miniPlayer"
  | "privatePlayback";

export type ExtensionInfo = {
  id: ExtensionId;
  name: string;
  blurb: string;
  group: "Ads and privacy" | "YouTube" | "Your feeds" | "Player" | "Look";
  defaultOn: boolean;
  credit?: { name: string; url: string };
};

export const EXTENSIONS: ExtensionInfo[] = [
  {
    id: "sponsorblock",
    name: "SponsorBlock",
    blurb: "Skips the ads creators read inside their videos: sponsors, self-promotion, and \"like and subscribe\" reminders. Choose which parts below.",
    group: "Ads and privacy",
    defaultOn: true,
    credit: { name: "SponsorBlock", url: "https://sponsor.ajay.app" },
  },
  {
    id: "privatePlayback",
    name: "Private playback",
    blurb: "YouTube videos play through this site's Invidious server in Jace Media's own player: YouTube never sees you, and there are no YouTube ads. Only shows when the site has an Invidious server.",
    group: "Ads and privacy",
    defaultOn: true,
    credit: { name: "Invidious", url: "https://invidious.io" },
  },
  {
    id: "privacy",
    name: "Privacy mode",
    blurb: "YouTube isn't contacted until you press play on a YouTube video. Thumbnails and lists always load through Jace Media.",
    group: "Ads and privacy",
    defaultOn: true,
  },
  {
    id: "dislikes",
    name: "Return YouTube Dislike",
    blurb: "Shows how many people disliked a YouTube video.",
    group: "YouTube",
    defaultOn: true,
    credit: { name: "Return YouTube Dislike", url: "https://returnyoutubedislike.com" },
  },
  {
    id: "dearrow",
    name: "DeArrow",
    blurb: "Swaps clickbait YouTube titles for clearer ones written by the community.",
    group: "YouTube",
    defaultOn: false,
    credit: { name: "DeArrow", url: "https://dearrow.ajay.app" },
  },
  { id: "hideShorts", name: "Hide Shorts", blurb: "Removes the Shorts tab and Shorts from every feed.", group: "Your feeds", defaultOn: false },
  { id: "hideWatched", name: "Hide watched videos", blurb: "Videos you've already watched leave your recommendations and feeds.", group: "Your feeds", defaultOn: false },
  {
    id: "focus",
    name: "Focus mode",
    blurb: "No recommended videos: For you and Up next only show your subscriptions. Search still works.",
    group: "Your feeds",
    defaultOn: false,
  },
  { id: "autoplayNext", name: "Autoplay next", blurb: "Plays the next video when one ends (with a 5-second countdown).", group: "Player", defaultOn: true },
  { id: "resume", name: "Resume where you left off", blurb: "Long videos pick up where you stopped.", group: "Player", defaultOn: true },
  { id: "miniPlayer", name: "Mini player", blurb: "Leave a video while it plays and it keeps playing in a corner while you browse.", group: "Player", defaultOn: true },
  { id: "rememberSpeed", name: "Remember speed", blurb: "Keeps your playback speed from one video to the next.", group: "Player", defaultOn: true },
  { id: "ambient", name: "Ambient glow", blurb: "A soft glow in the video's colors behind the player.", group: "Look", defaultOn: true },
  { id: "hideCounts", name: "Hide counts", blurb: "Hides view, like, and follower counts everywhere.", group: "Look", defaultOn: false },
];

/** How strict the content filter is (see lib/rating.ts). */
export type RatingLevel = "kids" | "teen" | "all";

export type Extensions = Record<ExtensionId, boolean> & {
  skip: SegmentCategory[];
  rating: RatingLevel;
  /** A custom feed's id to show as Home instead of For you (null: For you). */
  homeFeed: string | null;
};

export const DEFAULT_SKIP: SegmentCategory[] = ["sponsor", "selfpromo", "interaction"];

export const DEFAULT_EXTENSIONS: Extensions = {
  ...(Object.fromEntries(EXTENSIONS.map((e) => [e.id, e.defaultOn])) as Record<ExtensionId, boolean>),
  skip: DEFAULT_SKIP,
  rating: "teen",
  homeFeed: null,
};

const SKIPPABLE: SegmentCategory[] = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic"];

/** Reads saved settings; anything missing or broken falls back to the default. */
export function parseExtensions(raw: unknown): Extensions {
  let value: Record<string, unknown> = {};
  try {
    value = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {}
  if (!value || typeof value !== "object") value = {};
  const out = { ...DEFAULT_EXTENSIONS };
  for (const e of EXTENSIONS) if (typeof value[e.id] === "boolean") out[e.id] = value[e.id] as boolean;
  if (Array.isArray(value.skip)) out.skip = SKIPPABLE.filter((c) => (value.skip as unknown[]).includes(c));
  if (value.rating === "kids" || value.rating === "teen" || value.rating === "all") out.rating = value.rating;
  if (typeof value.homeFeed === "string" && /^[0-9a-f-]{36}$/.test(value.homeFeed)) out.homeFeed = value.homeFeed;
  return out;
}
