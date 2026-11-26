import { followKey, followTarget } from "@/lib/follow";
import { getTaste } from "@/lib/recommend";
import { filterPosts } from "@/lib/ratingfilter";
import type { FeedItem } from "@/lib/types";
import { PostCard } from "./PostCard";

/** A list of posts from any network, each knowing whether you already follow its author. */
export async function FeedList({ items: all, empty }: { items: FeedItem[]; empty?: string }) {
  const items = await filterPosts(all);
  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{empty ?? "Nothing here yet."}</p>;
  }
  const taste = await getTaste();
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const target = followTarget(item);
        return <PostCard key={`${item.network}:${item.id}`} item={item} followed={!!target && taste.following.has(followKey(target))} />;
      })}
    </div>
  );
}
