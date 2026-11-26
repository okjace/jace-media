/** Every service Jace Media can show. People choose which ones they want (all of them by default). */
export const SERVICES = [
  { id: "jace", label: "Jace posts", blurb: "Posts from people on Jace Media" },
  { id: "jacevideos", label: "Jace videos", blurb: "Videos and Shorts uploaded to Jace" },
  { id: "youtube", label: "YouTube", blurb: "Videos and Shorts from YouTube, with no ads added" },
  { id: "bluesky", label: "Bluesky", blurb: "Posts from Bluesky" },
  { id: "mastodon", label: "Mastodon", blurb: "Posts from Mastodon" },
  { id: "lemmy", label: "Lemmy", blurb: "Posts from Lemmy communities" },
  { id: "hackernews", label: "Hacker News", blurb: "Tech news from Hacker News" },
  { id: "rss", label: "News & blogs", blurb: "Any website, blog, or news site you follow by its RSS feed" },
  { id: "jacelive", label: "Jace Live", blurb: "Live games happening now on Jace Live" },
  { id: "twitch", label: "Twitch", blurb: "Live streams from Twitch (Twitch shows its own ads)" },
] as const;

export type Service = (typeof SERVICES)[number]["id"];

export const ALL_SERVICES: Service[] = SERVICES.map((s) => s.id);

/** What a new person starts with: YouTube, Jace videos, and Jace posts. */
export const DEFAULT_SERVICES: Service[] = ["youtube", "jacevideos", "jace"];

export function isService(value: unknown): value is Service {
  return typeof value === "string" && (ALL_SERVICES as string[]).includes(value);
}

/** Services added after the first version: on for people who saved their choices before they existed. */
const ADDED_LATER: Service[] = ["rss", "jacelive", "twitch"];

/**
 * Reads saved choices. They're stored as what's turned off ({"off": [...]}),
 * so services added later start on. The first format (a list of what's on)
 * is still read, with the later services added.
 */
export function parseServices(raw: string | null | undefined): Service[] {
  if (!raw) return DEFAULT_SERVICES;
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) {
      const kept = ALL_SERVICES.filter((s) => value.includes(s) || ADDED_LATER.includes(s));
      return kept.length ? kept : DEFAULT_SERVICES;
    }
    const off = Array.isArray(value?.off) ? (value.off as unknown[]) : [];
    const kept = ALL_SERVICES.filter((s) => !off.includes(s));
    return kept.length ? kept : DEFAULT_SERVICES;
  } catch {
    return DEFAULT_SERVICES;
  }
}

/** How choices are saved: the services turned off. */
export function serializeServices(on: Service[]): string {
  return JSON.stringify({ off: ALL_SERVICES.filter((s) => !on.includes(s)) });
}
