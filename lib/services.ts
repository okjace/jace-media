/** Every service Jace Media can show. People choose which ones they want (all of them by default). */
export const SERVICES = [
  { id: "jace", label: "Jace posts", blurb: "Posts from people on Jace Media" },
  { id: "jacevideos", label: "Jace videos", blurb: "Videos and Shorts uploaded to Jace" },
  { id: "youtube", label: "YouTube", blurb: "Videos and Shorts from YouTube, with no ads added" },
  { id: "bluesky", label: "Bluesky", blurb: "Posts from Bluesky" },
  { id: "mastodon", label: "Mastodon", blurb: "Posts from Mastodon" },
  { id: "lemmy", label: "Lemmy", blurb: "Posts from Lemmy communities" },
  { id: "hackernews", label: "Hacker News", blurb: "Tech news from Hacker News" },
] as const;

export type Service = (typeof SERVICES)[number]["id"];

export const ALL_SERVICES: Service[] = SERVICES.map((s) => s.id);

export function isService(value: unknown): value is Service {
  return typeof value === "string" && (ALL_SERVICES as string[]).includes(value);
}

/** Reads a saved list; anything broken or empty means "all services". */
export function parseServices(raw: string | null | undefined): Service[] {
  if (!raw) return ALL_SERVICES;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return ALL_SERVICES;
    const kept = ALL_SERVICES.filter((s) => list.includes(s));
    return kept.length ? kept : ALL_SERVICES;
  } catch {
    return ALL_SERVICES;
  }
}
