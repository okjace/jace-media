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
import { jaceLiveHostUrl, jaceLiveSets, type JaceLiveSet } from "@/lib/live";
import { getTaste, rankPosts } from "@/lib/recommend";
import type { Service } from "@/lib/services";
import { searchBluesky, searchHackerNews, searchLemmy, searchMastodon, searchPeople, type PersonResult } from "@/lib/social";
import type { FeedItem, VideoCard } from "@/lib/types";
import { hasYouTubeApi, parseYouTubeVideo, search as searchYouTube, searchChannels, searchLive, type ChannelResult } from "@/lib/youtube";
import { withDeArrow } from "@/lib/ytextras";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const q = (await searchParams).q;
  return { title: typeof q === "string" && q ? `${q} - Search` : "Search" };
}

const FILTERS: { id: string; label: string; services: Service[] }[] = [
  { id: "all", label: "All", services: [] },
  { id: "videos", label: "Videos", services: ["youtube", "jacevideos"] },
  { id: "channels", label: "Channels", services: ["youtube", "bluesky", "mastodon", "lemmy"] },
  { id: "live", label: "Live", services: ["youtube", "jacelive"] },
  { id: "jace", label: "Jace", services: ["jace", "jacevideos"] },
  { id: "youtube", label: "YouTube", services: ["youtube"] },
  { id: "bluesky", label: "Bluesky", services: ["bluesky"] },
  { id: "mastodon", label: "Mastodon", services: ["mastodon"] },
  { id: "lemmy", label: "Lemmy", services: ["lemmy"] },
  { id: "hackernews", label: "Hacker News", services: ["hackernews"] },
];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** One search across every service you turned on, with filters for platforms, channels, and live. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const taste = await getTaste();
  const has = (s: Service) => taste.services.includes(s);
  const available = FILTERS.filter((f) => f.id === "all" || f.services.some(has));
  const filter = available.find((f) => f.id === sp.in) ?? available[0];
  const on = (s: Service) => has(s) && (filter.id === "all" || filter.services.includes(s));

  if (!q) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title="Search">Search posts, videos, channels, people, communities, and live streams on every service at once.</PageTitle>
      </div>
    );
  }
  const linked = parseYouTubeVideo(q);
  if (linked) redirect(`/watch/youtube/${linked}`);

  const f = filter.id;
  const wantPosts = !["videos", "youtube", "channels", "live"].includes(f);
  const wantVideos = ["all", "videos", "jace", "youtube"].includes(f);
  const wantChannels = ["all", "channels", "youtube"].includes(f) && has("youtube") && hasYouTubeApi;
  const wantPeople = ["all", "channels", "bluesky", "mastodon", "lemmy"].includes(f);
  const wantLive = f === "live";

  const postTasks: Promise<FeedItem[]>[] = [];
  if (wantPosts) {
    if (on("jace")) postTasks.push(jacePosts({ q, limit: 20 }).then((r) => r.items));
    if (on("bluesky")) postTasks.push(searchBluesky(q).then((r) => r ?? []));
    if (on("mastodon")) postTasks.push(searchMastodon(q).then((r) => r ?? []));
    if (on("lemmy")) postTasks.push(searchLemmy(q).then((r) => r ?? []));
    if (on("hackernews")) postTasks.push(searchHackerNews(q).then((r) => r ?? []));
  }
  const peopleNetworks = ["all", "channels"].includes(f) ? taste.services : [f];
  const [posts, jace, yt, channels, people, live, sets] = await Promise.all([
    Promise.all(postTasks).then((r) => r.flat()),
    wantVideos && on("jacevideos") ? jaceVideos({ q, limit: 12 }).then((r) => r.videos) : Promise.resolve([] as VideoCard[]),
    wantVideos && on("youtube") ? searchYouTube(q, f === "all" ? 12 : 24).then((r) => r ?? []) : Promise.resolve([] as VideoCard[]),
    wantChannels ? searchChannels(q, f === "all" ? 6 : 18) : Promise.resolve([] as ChannelResult[]),
    wantPeople ? searchPeople(q, peopleNetworks) : Promise.resolve([] as PersonResult[]),
    wantLive && has("youtube") ? searchLive(q, 18) : Promise.resolve([] as VideoCard[]),
    wantLive && has("jacelive") ? jaceLiveSets(q) : Promise.resolve([] as JaceLiveSet[]),
  ]);
  const videos = await withDeArrow(interleave(jace, yt));
  const ranked = rankPosts(posts, taste, 40);

  const chip = (active: boolean) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-foreground text-background" : "bg-foreground/[.07] hover:bg-foreground/[.12]"}`;
  const nothing = !ranked.length && !videos.length && !people.length && !channels.length && !live.length && !sets.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Results for &quot;{q}&quot;</h1>
        <nav aria-label="Filter results" className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
          {available.map((x) => (
            <Link
              key={x.id}
              href={`/search?q=${encodeURIComponent(q)}${x.id === "all" ? "" : `&in=${x.id}`}`}
              aria-current={x.id === f ? "page" : undefined}
              className={chip(x.id === f)}
            >
              {x.label}
            </Link>
          ))}
        </nav>
      </div>

      {channels.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Channels</h2>
          <div className={f === "all" ? "no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
            {channels.map((c) => (
              <Link
                key={c.id}
                href={`/channel/youtube/${c.id}`}
                className={`flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 hover:border-foreground/25 ${f === "all" ? "w-72 shrink-0" : ""}`}
              >
                <Avatar name={c.name} src={c.picture} size={56} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="line-clamp-2 text-xs text-muted">{c.description || "YouTube channel"}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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

      {live.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Live now</h2>
          <VideoGrid videos={live} />
        </section>
      )}
      {sets.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Jace Live games to host</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sets.map((s) => (
              <a key={s.id} href={jaceLiveHostUrl(s.id)} className="rounded-2xl border border-line bg-panel p-4 hover:border-accent/60">
                <span className="text-3xl">{s.cover || "❓"}</span>
                <span className="mt-2 line-clamp-2 block font-medium">{s.title}</span>
                <span className="mt-1 block text-xs text-muted">
                  {s.questionCount} questions · {compact.format(s.plays)} plays
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Videos</h2>
          <VideoGrid videos={f === "all" ? videos.slice(0, 6) : videos} />
          {f === "all" && videos.length > 6 && (
            <Link href={`/search?q=${encodeURIComponent(q)}&in=videos`} className="self-start text-sm text-accent hover:underline">
              More videos
            </Link>
          )}
        </section>
      )}
      {(wantVideos || wantChannels || wantLive) && has("youtube") && !hasYouTubeApi && (
        <p className="text-sm text-muted">YouTube search needs a YouTube API key on this server. Paste any YouTube link to watch it.</p>
      )}

      {ranked.length > 0 && (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <h2 className="font-semibold">Posts</h2>
          <FeedList items={ranked} />
        </section>
      )}

      {nothing && <EmptyState title={`Nothing found for "${q}"`}>Try other words, or another filter.</EmptyState>}
    </div>
  );
}
