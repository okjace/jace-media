import Link from "next/link";
import type { ReactNode } from "react";
import { HomeFeedButton } from "@/components/HomeFeedButton";
import { HomeLayout } from "@/components/feed/HomeLayout";
import type { CustomFeed, Entry } from "@/lib/customfeeds";

/** A custom feed, laid out exactly like Home. */
export function FeedPage({ feed, entries, subtitle, actions }: { feed: CustomFeed; entries: Entry[]; subtitle?: string; actions?: ReactNode }) {
  const videos = entries.flatMap((e) => (e.kind === "video" && !e.video.short ? [e.video] : []));
  const shorts = entries.flatMap((e) => (e.kind === "video" && e.video.short ? [e.video] : []));
  const posts = entries.flatMap((e) => (e.kind === "post" ? [e.item] : []));
  const subs = feed.rules.only === "subscriptions";
  return (
    <HomeLayout
      header={
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{feed.name}</h1>
            <p className="text-sm text-muted">
              {subtitle ?? (subs ? "Only what you follow" : "From everywhere")} · {feed.rules.sort === "latest" ? "newest first" : "recommended for you"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions}
            <HomeFeedButton feedId={feed.id} />
            <Link href={`/feeds?edit=${feed.id}`} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
              Edit feed
            </Link>
          </div>
        </div>
      }
      videos={videos}
      shorts={shorts}
      posts={posts}
      videosTitle={feed.rules.sort === "latest" ? "Latest videos" : "Videos for you"}
      empty={subs ? "Nothing new from the people and channels you follow." : "Nothing matches this feed right now."}
    />
  );
}
