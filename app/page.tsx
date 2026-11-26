import Link from "next/link";
import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/prefs";
import { FeedPage } from "@/components/feed/FeedPage";
import { HomeLayout } from "@/components/feed/HomeLayout";
import { getViewer } from "@/lib/auth";
import { buildFeed, getFeed } from "@/lib/customfeeds";
import { jacePosts } from "@/lib/feeds";
import { getTaste, rankPosts, recommendedVideos } from "@/lib/recommend";
import { NETWORKS } from "@/lib/social";
import { followedRss } from "@/lib/rss";
import { withDeArrow } from "@/lib/ytextras";
import type { FeedItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * For you: recommended videos, Shorts, and posts from every service you
 * turned on, ranked for you (see lib/recommend.ts).
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  // First time here: the setup screen.
  if (await needsSetup()) redirect("/setup");
  // Your chosen custom feed, if you picked one as Home (For you is one tap away).
  const taste = await getTaste();
  if (taste.ext.homeFeed && (await searchParams).for !== "you") {
    const viewer = await getViewer();
    const feed = viewer ? await getFeed(viewer.sub, taste.ext.homeFeed).catch(() => null) : null;
    if (feed) {
      const entries = await buildFeed(feed.rules, 80);
      return (
        <FeedPage
          feed={feed}
          entries={entries}
          subtitle="Your Home feed"
          actions={
            <Link href="/?for=you" className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
              For you
            </Link>
          }
        />
      );
    }
  }
  return <ForYou />;
}

/** For you: recommended videos, Shorts, and posts from every service you turned on. */
async function ForYou() {
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
    <HomeLayout
      videos={videos}
      shorts={shorts}
      posts={ranked}
      composer={on("jace")}
      empty="Nothing to show right now. Turn on more services in Choose services."
      notice={
        !taste.signedIn && (
          <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
            Sign in and import your YouTube history to get recommendations made for you.
          </p>
        )
      }
    />
  );
}
