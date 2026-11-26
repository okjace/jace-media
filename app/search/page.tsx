import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { FeedList } from "@/components/feed/FeedList";
import { NetworkBadge } from "@/components/feed/NetworkBadge";
import { PageTitle } from "@/components/PageTitle";
import { EmptyState, VideoGrid } from "@/components/videos/VideoGrid";
import { interleave, jaceVideos } from "@/lib/data";
import { jacePosts } from "@/lib/feeds";
import { getTaste, rankPosts } from "@/lib/recommend";
import type { Service } from "@/lib/services";
import { searchBluesky, searchHackerNews, searchLemmy, searchMastodon, searchPeople } from "@/lib/social";
import type { FeedItem, VideoCard } from "@/lib/types";
import { hasYouTubeApi, parseYouTubeVideo, search as searchYouTube } from "@/lib/youtube";
import { withDeArrow } from "@/lib/ytextras";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const q = (await searchParams).q;
  return { title: typeof q === "string" && q ? `${q} - Search` : "Search" };
}

const FILTERS: { id: string; label: string; services: Service[] }[] = [
  { id: "all", label: "All", services: [] },
  { id: "videos", label: "Videos", services: ["youtube", "jacevideos"] },
  { id: "jace", label: "Jace", services: ["jace", "jacevideos"] },
  { id: "youtube", label: "YouTube", services: ["youtube"] },
  { id: "bluesky", label: "Bluesky", services: ["bluesky"] },
  { id: "mastodon", label: "Mastodon", services: ["mastodon"] },
  { id: "lemmy", label: "Lemmy", services: ["lemmy"] },
  { id: "hackernews", label: "Hacker News", services: ["hackernews"] },
];

/** One search across every service you turned on, with a filter per platform. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const taste = await getTaste();
  const available = FILTERS.filter((f) => f.id === "all" || f.services.some((s) => taste.services.includes(s)));
  const filter = available.find((f) => f.id === sp.in) ?? available[0];
  const on = (s: Service) => taste.services.includes(s) && (filter.id === "all" || filter.services.includes(s));

  if (!q) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title="Search">Search posts, videos, people, and communities on every service at once.</PageTitle>
      </div>
    );
  }
  const linked = parseYouTubeVideo(q);
  if (linked) redirect(`/watch/youtube/${linked}`);

  const postTasks: Promise<FeedItem[]>[] = [];
  if (on("jace")) postTasks.push(jacePosts({ q, limit: 20 }).then((r) => r.items));
  if (on("bluesky")) postTasks.push(searchBluesky(q).then((r) => r ?? []));
  if (on("mastodon")) postTasks.push(searchMastodon(q).then((r) => r ?? []));
  if (on("lemmy")) postTasks.push(searchLemmy(q).then((r) => r ?? []));
  if (on("hackernews")) postTasks.push(searchHackerNews(q).then((r) => r ?? []));
  const filterIsVideo = filter.id === "videos" || filter.id === "youtube";
  const [posts, jace, yt, people] = await Promise.all([
    filterIsVideo ? Promise.resolve([] as FeedItem[]) : Promise.all(postTasks).then((r) => r.flat()),
    on("jacevideos") ? jaceVideos({ q, limit: 12 }).then((r) => r.videos) : Promise.resolve([] as VideoCard[]),
    on("youtube") ? searchYouTube(q, 12).then((r) => r ?? []) : Promise.resolve([] as VideoCard[]),
    filter.id === "all" || ["bluesky", "mastodon", "lemmy"].includes(filter.id)
      ? searchPeople(q, filter.id === "all" ? taste.services : [filter.id])
      : Promise.resolve([]),
  ]);
  const videos = await withDeArrow(interleave(jace, yt));
  const ranked = rankPosts(posts, taste, 40);

  const chip = (active: boolean) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-foreground text-background" : "bg-foreground/[.07] hover:bg-foreground/[.12]"}`;
  const nothing = !ranked.length && !videos.length && !people.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Results for &quot;{q}&quot;</h1>
        <nav aria-label="Filter by platform" className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
          {available.map((f) => (
            <Link
              key={f.id}
              href={`/search?q=${encodeURIComponent(q)}${f.id === "all" ? "" : `&in=${f.id}`}`}
              aria-current={f.id === filter.id ? "page" : undefined}
              className={chip(f.id === filter.id)}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {people.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">People and communities</h2>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {people.map((p) => (
              <Link key={p.href} href={p.href} className="flex w-44 shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-4 text-center hover:border-foreground/25">
                <Avatar name={p.name} src={p.picture} size={56} />
                <span className="w-full truncate font-medium">{p.name}</span>
                <span className="w-full truncate text-xs text-muted">{p.handle}</span>
                <NetworkBadge network={p.network === "lemmy-user" ? "lemmy" : (p.network as "bluesky" | "mastodon" | "lemmy" | "hackernews")} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Videos</h2>
          <VideoGrid videos={filterIsVideo ? videos : videos.slice(0, 6)} />
        </section>
      )}
      {on("youtube") && !hasYouTubeApi && (filterIsVideo || filter.id === "all") && (
        <p className="text-sm text-muted">YouTube search needs a YouTube API key on this server. Paste any YouTube link to watch it.</p>
      )}

      {ranked.length > 0 && (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <h2 className="font-semibold">Posts</h2>
          <FeedList items={ranked} />
        </section>
      )}

      {nothing && <EmptyState title={`Nothing found for "${q}"`}>Try other words, or another platform.</EmptyState>}
    </div>
  );
}
