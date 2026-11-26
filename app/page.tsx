import Link from "next/link";
import { Composer } from "@/components/feed/Composer";
import { FeedList } from "@/components/feed/FeedList";
import { ContinueWatching } from "@/components/videos/ContinueWatching";
import { VideoGrid } from "@/components/videos/VideoGrid";
import { jacePosts } from "@/lib/feeds";
import { watchHref } from "@/lib/format";
import { getTaste, rankPosts, recommendedVideos } from "@/lib/recommend";
import { NETWORKS } from "@/lib/social";
import { followedRss } from "@/lib/rss";
import { withDeArrow } from "@/lib/ytextras";
import type { FeedItem, VideoCard } from "@/lib/types";

export const dynamic = "force-dynamic";

function ShortsShelf({ shorts }: { shorts: VideoCard[] }) {
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
          <Link key={`${s.source}:${s.id}`} href={watchHref(s)} className="group w-36 shrink-0">
            <div className="aspect-[9/16] overflow-hidden rounded-xl bg-panel">
              {s.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{s.title}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * For you: recommended videos, Shorts, and posts from every service you
 * turned on, ranked for you (see lib/recommend.ts).
 */
export default async function ForYouPage() {
  const taste = await getTaste();
  const on = (s: (typeof taste.services)[number]) => taste.services.includes(s);
  const wantVideos = on("youtube") || on("jacevideos");

  const postTasks: Promise<FeedItem[]>[] = [];
  if (on("jace")) postTasks.push(jacePosts({ limit: 30 }).then((r) => r.items));
  for (const key of ["bluesky", "mastodon", "lemmy", "hackernews"] as const) {
    if (on(key)) postTasks.push(NETWORKS[key].load(25).then((r) => r ?? []));
  }
  if (on("rss")) postTasks.push(followedRss(4));
  const [posts, videos, shorts] = await Promise.all([
    Promise.all(postTasks).then((r) => r.flat()),
    wantVideos ? recommendedVideos({ limit: 12 }).then(withDeArrow) : Promise.resolve([]),
    wantVideos && !taste.ext.hideShorts ? recommendedVideos({ shorts: true, limit: 12 }).then(withDeArrow) : Promise.resolve([]),
  ]);
  const ranked = rankPosts(posts, taste, 60);

  return (
    <div className="flex flex-col gap-8">
      <ContinueWatching />
      {videos.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recommended videos</h2>
            <Link href="/videos" className="text-sm text-accent hover:underline">
              More videos
            </Link>
          </div>
          <VideoGrid videos={videos.slice(0, 6)} />
        </section>
      )}
      {!taste.signedIn && (
        <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
          Sign in and import your YouTube history to get recommendations made for you.
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {on("jace") && <Composer />}
          <ShortsShelf shorts={shorts} />
          <FeedList items={ranked.slice(0, 30)} empty="Nothing to show right now. Turn on more services in Choose services." />
          {videos.length > 6 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">More for you</h2>
              <VideoGrid videos={videos.slice(6)} />
            </section>
          )}
          {ranked.length > 30 && <FeedList items={ranked.slice(30)} />}
        </div>
        <aside className="hidden flex-col gap-3 text-sm lg:sticky lg:top-32 lg:flex lg:self-start">
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
