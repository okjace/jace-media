import "server-only";
import { getPost } from "./posts";
import { blueskyThread, hnThread, lemmyThread, mastodonThread } from "./social";
import type { FeedItem } from "./types";

/** Fetches a post from any network by its id, for quoting or reposting it. */
export async function resolvePost(network: unknown, id: unknown, viewer: { sub: string; isAdmin: boolean }): Promise<FeedItem | null> {
  if (typeof id !== "string" || id.length > 300) return null;
  switch (network) {
    case "jace": {
      const post = await getPost(viewer, id);
      // Quoting a repost quotes the original.
      return post?.repostedBy ? post : (post ?? null);
    }
    case "bluesky":
      return id.startsWith("at://") ? ((await blueskyThread(id))?.post ?? null) : null;
    case "mastodon":
      return /^\d+$/.test(id) ? ((await mastodonThread(id))?.post ?? null) : null;
    case "lemmy":
      return (await lemmyThread(id))?.post ?? null;
    case "hackernews":
      return (await hnThread(id))?.post ?? null;
    default:
      return null;
  }
}
