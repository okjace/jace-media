import "server-only";
import { getViewer } from "./auth";
import { listPosts } from "./posts";
import type { FeedItem } from "./types";

/** Jace posts for a page, as the signed-in person sees them. Never throws. */
export async function jacePosts(opts: Parameters<typeof listPosts>[1] = {}): Promise<{ items: FeedItem[]; available: boolean }> {
  try {
    const viewer = await getViewer();
    return { items: await listPosts(viewer ? { sub: viewer.sub, isAdmin: viewer.isAdmin } : null, opts), available: true };
  } catch (err) {
    console.error("Couldn't load Jace posts:", err instanceof Error ? err.message : err);
    return { items: [], available: false };
  }
}
