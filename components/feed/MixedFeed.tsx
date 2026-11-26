import Link from "next/link";
import { VideoMenu } from "@/components/actions/VideoMenu";
import { SourceBadge } from "@/components/videos/VideoGrid";
import type { Entry } from "@/lib/customfeeds";
import { followKey, followTarget } from "@/lib/follow";
import { duration, timeAgo, views, watchHref } from "@/lib/format";
import { getTaste } from "@/lib/recommend";
import type { VideoCard } from "@/lib/types";
import { PostCard } from "./PostCard";

/** A video inside a feed of posts: a wide card with the thumbnail on the left. */
export function VideoFeedCard({ video }: { video: VideoCard }) {
  const length = duration(video.duration);
  return (
    <article data-video-tile className="group flex gap-4 rounded-2xl border border-line bg-panel p-3 transition-colors hover:border-foreground/20">
      <Link href={watchHref(video)} className={`relative shrink-0 overflow-hidden rounded-xl bg-black/30 ${video.short ? "aspect-[9/16] w-28" : "aspect-video w-48 sm:w-64"}`}>
        {video.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        )}
        <span className="absolute left-2 top-2">
          <SourceBadge source={video.source} />
        </span>
        {video.short && <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">Shorts</span>}
        {length && !video.short && <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs text-white">{length}</span>}
      </Link>
      <div className="flex min-w-0 flex-1 items-start gap-2 py-1">
        <div className="min-w-0 flex-1">
          <Link href={watchHref(video)} className="line-clamp-2 font-medium leading-snug hover:underline">
            {video.title}
          </Link>
          <p className="mt-1 truncate text-sm text-muted">{video.channelName}</p>
          <p className="text-sm text-muted">{[views(video.views), timeAgo(video.publishedAt)].filter(Boolean).join(" · ")}</p>
        </div>
        <VideoMenu source={video.source} id={video.id} channelId={video.channelId} channelName={video.channelName} />
      </div>
    </article>
  );
}

export async function MixedFeed({ entries, empty }: { entries: Entry[]; empty: React.ReactNode }) {
  if (entries.length === 0) {
    return <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{empty}</div>;
  }
  const taste = await getTaste();
  return (
    <div className="flex flex-col gap-3">
      {entries.map((e) => {
        if (e.kind === "video") return <VideoFeedCard key={`v:${e.video.source}:${e.video.id}`} video={e.video} />;
        const target = followTarget(e.item);
        return <PostCard key={`p:${e.item.network}:${e.item.id}`} item={e.item} followed={!!target && taste.following.has(followKey(target))} />;
      })}
    </div>
  );
}
