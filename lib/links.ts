import type { FeedItem } from "./types";

/** Where a post opens inside Jace Media (never leaving the site). */
export function postHref(item: FeedItem): string {
  // Articles from news sites and blogs open on their site.
  if (item.network === "rss") return item.url;
  return item.network === "jace" ? item.url : `/p/${item.network}/${encodeURIComponent(item.id)}`;
}

/** Where a post's author opens inside Jace Media. */
export function authorHref(item: FeedItem): string | null {
  const handle = item.author.handle.replace(/^@/, "");
  switch (item.network) {
    case "jace":
      return item.author.url;
    case "bluesky":
      return `/channel/bluesky/${encodeURIComponent(handle)}`;
    case "mastodon":
      return `/channel/mastodon/${encodeURIComponent(handle)}`;
    case "lemmy":
      return `/channel/lemmy-user/${encodeURIComponent(handle)}`;
    case "hackernews":
      return handle ? `/channel/hackernews/${encodeURIComponent(handle)}` : null;
    case "rss":
      return item.author.url;
  }
}

/** A Lemmy post's community, inside Jace Media. */
export function placeHref(item: FeedItem): string | null {
  return item.network === "lemmy" && item.place ? `/channel/lemmy/${encodeURIComponent(item.place.replace(/^c\//, ""))}` : null;
}
