import Link from "next/link";
import type { ReactNode } from "react";
import { Composer } from "@/components/feed/Composer";
import { FeedList } from "@/components/feed/FeedList";
import { ContinueWatching } from "@/components/videos/ContinueWatching";
import { VideoGrid } from "@/components/videos/VideoGrid";
import { VideoMenu } from "@/components/actions/VideoMenu";
import { watchHref } from "@/lib/format";
import type { FeedItem, VideoCard } from "@/lib/types";

export function ShortsShelf({ shorts }: { shorts: VideoCard[] }) {
  if (shorts.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Shorts</h2>
        <Link href="/shorts" className="text-sm text-accent hover:underline">
          Watch Shorts
        </Link>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {shorts.map((s) => (
          <div key={`${s.source}:${s.id}`} data-video-tile className="group relative w-36 shrink-0">
            <Link href={watchHref(s)} className="block">
              <div className="aspect-[9/16] overflow-hidden rounded-xl bg-panel">
                {s.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 pr-6 text-sm font-medium leading-snug">{s.title}</p>
            </Link>
            <div className="absolute bottom-0 right-[-6px]">
              <VideoMenu source={s.source} id={s.id} channelId={s.channelId} channelName={s.channelName} title={s.title} thumbnail={s.thumbnail} short />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The Home look: a header, Continue watching, a row of videos, then posts with
 * a Shorts shelf, more videos further down, and a side panel. For you and every
 * custom feed use it, so they all look the same.
 */
export function HomeLayout({
  header,
  videos,
  shorts,
  posts,
  composer = false,
  continueWatching = true,
  videosTitle = "Recommended videos",
  empty,
  side,
  notice,
}: {
  header?: ReactNode;
  videos: VideoCard[];
  shorts: VideoCard[];
  posts: FeedItem[];
  composer?: boolean;
  continueWatching?: boolean;
  videosTitle?: string;
  empty: string;
  side?: ReactNode;
  notice?: ReactNode;
}) {
  const nothing = videos.length === 0 && shorts.length === 0 && posts.length === 0;
  return (
    <div className="flex flex-col gap-8">
      {header}
      {continueWatching && <ContinueWatching />}
      {videos.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{videosTitle}</h2>
            <Link href="/videos" className="text-sm text-accent hover:underline">
              More videos
            </Link>
          </div>
          <VideoGrid videos={videos.slice(0, 6)} />
        </section>
      )}
      {notice}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {composer && <Composer />}
          <ShortsShelf shorts={shorts} />
          {(posts.length > 0 || nothing) && <FeedList items={posts.slice(0, 30)} empty={empty} />}
          {videos.length > 6 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">More for you</h2>
              <VideoGrid videos={videos.slice(6)} />
            </section>
          )}
          {posts.length > 30 && <FeedList items={posts.slice(30)} />}
        </div>
        <aside className="hidden flex-col gap-3 text-sm lg:sticky lg:top-32 lg:flex lg:self-start">
          {side}
          <div className="rounded-2xl border border-line bg-panel p-4">
            <p className="font-semibold">Make it yours</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-muted">
              <li><Link href="/import" className="hover:text-foreground">↳ Import from YouTube</Link></li>
              <li><Link href="/services" className="hover:text-foreground">↳ Choose services</Link></li>
              <li><Link href="/feeds" className="hover:text-foreground">↳ Make a custom feed</Link></li>
              <li><Link href="/library" className="hover:text-foreground">↳ Your library</Link></li>
            </ul>
          </div>
          <p className="px-1 text-xs text-muted">No ads on Jace Media, ever.</p>
        </aside>
      </div>
    </div>
  );
}
