import type { FeedItem } from "./types";

export type FollowTarget = { kind: "jace" | "bluesky" | "mastodon" | "lemmy"; ref: string; name: string; picture: string | null };

/** What "Follow" on a post means: the person who posted it, or for Lemmy, the community. Hacker News has no follows. */
export function followTarget(item: FeedItem): FollowTarget | null {
  const handle = item.author.handle.replace(/^@/, "");
  switch (item.network) {
    case "jace":
      return item.authorSub ? { kind: "jace", ref: item.authorSub, name: item.author.name, picture: item.author.picture } : null;
    case "bluesky":
    case "mastodon":
      return { kind: item.network, ref: handle, name: item.author.name, picture: item.author.picture };
    case "lemmy":
      return item.place ? { kind: "lemmy", ref: item.place.replace(/^c\//, ""), name: item.place, picture: null } : null;
    default:
      return null;
  }
}

export function followKey(t: { kind: string; ref: string }): string {
  return `${t.kind}:${t.ref.toLowerCase()}`;
}
