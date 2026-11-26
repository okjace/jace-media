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
import { searchProfiles } from "@/lib/profiles";
import { getTaste, rankPosts } from "@/lib/recommend";
import { searchFollowedRss } from "@/lib/rss";
import { SERVICES, type Service } from "@/lib/services";
import { searchBluesky, searchHackerNews, searchLemmy, searchMastodon, searchPeople, type PersonResult } from "@/lib/social";
import type { FeedItem, Profile, VideoCard } from "@/lib/types";
import {
  hasYouTubeApi,
  parseYouTubeVideo,
  search as searchYouTube,
  searchChannels,
  searchLive,
  searchPlaylists,
  searchShorts,
  type ChannelResult,
  type PlaylistResult,
} from "@/lib/youtube";
import { withDeArrow } from "@/lib/ytextras";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const q = (await searchParams).q;
  return { title: typeof q === "string" && q ? `${q} - Search` : "Search" };
}

/** What to find. */
const TYPES = [
  { id: "all", label: "All" },
  { id: "posts", label: "Posts" },
  { id: "videos", label: "Videos" },
  { id: "shorts", label: "Shorts" },
  { id: "channels", label: "Channels" },
  { id: "people", label: "People" },
  { id: "playlists", label: "Playlists" },
  { id: "live", label: "Live" },
  { id: "news", label: "News" },
] as const;
type Type = (typeof TYPES)[number]["id"];

/** Services that can be searched (Twitch has no search here). */
const SEARCHABLE: Service[] = ["jace", "jacevideos", "youtube", "bluesky", "mastodon", "lemmy", "hackernews", "rss", "jacelive"];

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** One search across the platforms you pick, for posts, videos, Shorts, channels, people, playlists, live, and news. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const taste = await getTaste();
  const enabled = SEARCHABLE.filter((s) => taste.services.includes(s));
  // Which platforms to search: ?on=youtube,bluesky (default: every one you have on).
  const picked = typeof sp.on === "string" ? enabled.filter((s) => sp.on!.toString().split(",").includes(s)) : enabled;
  const where = picked.length ? picked : enabled;
  const type: Type = TYPES.some((t) => t.id === sp.type) ? (sp.type as Type) : "all";
  const has = (s: Service) => where.includes(s);
  const want = (...types: Type[]) => type === "all" || types.includes(type);

  const href = (patch: { type?: Type; on?: Service[] }) => {
    const p = new URLSearchParams({ q });
    const t = patch.type ?? type;
    if (t !== "all") p.set("type", t);
    const on = patch.on ?? (typeof sp.on === "string" ? where : null);
    if (on && on.length && on.length < enabled.length) p.set("on", on.join(","));
    return `/search?${p}`;
  };

  if (!q) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title="Search">Search posts, videos, Shorts, channels, people, playlists, live streams, and news, on the platforms you pick.</PageTitle>
      </div>
    );
  }
  const linked = parseYouTubeVideo(q);
  if (linked) redirect(`/watch/youtube/${linked}`);

  const yt = has("youtube") && hasYouTubeApi;
  const big = type !== "all";
  const postTasks: Promise<FeedItem[]>[] = [];
  if (want("posts")) {
    if (has("jace")) postTasks.push(jacePosts({ q, limit: 20 }).then((r) => r.items));
    if (has("bluesky")) postTasks.push(searchBluesky(q).then((r) => r ?? []));
    if (has("mastodon")) postTasks.push(searchMastodon(q).then((r) => r ?? []));
    if (has("lemmy")) postTasks.push(searchLemmy(q).then((r) => r ?? []));
  }
  const newsTasks: Promise<FeedItem[]>[] = [];
  if (want("news", "posts")) {
    if (has("hackernews")) newsTasks.push(searchHackerNews(q).then((r) => r ?? []));
    if (has("rss")) newsTasks.push(searchFollowedRss(q));
  }
  const peopleNetworks = where.filter((s) => s === "bluesky" || s === "mastodon" || s === "lemmy");

  const [posts, news, jaceVids, ytVids, shorts, channels, people, jacePeople, playlists, live, sets] = await Promise.all([
    Promise.all(postTasks).then((r) => r.flat()),
    Promise.all(newsTasks).then((r) => r.flat()),
    want("videos", "shorts") && has("jacevideos") ? jaceVideos({ q, limit: 24 }).then((r) => r.videos) : Promise.resolve([] as VideoCard[]),
    want("videos") && yt ? searchYouTube(q, big ? 24 : 12).then((r) => r ?? []) : Promise.resolve([] as VideoCard[]),
    want("shorts") && yt ? searchShorts(q, big ? 24 : 12) : Promise.resolve([] as VideoCard[]),
    want("channels") && yt ? searchChannels(q, big ? 18 : 6) : Promise.resolve([] as ChannelResult[]),
    want("people", "channels") && peopleNetworks.length ? searchPeople(q, peopleNetworks) : Promise.resolve([] as PersonResult[]),
    want("people") && (has("jace") || has("jacevideos")) ? searchProfiles(q, big ? 24 : 8).catch(() => [] as Profile[]) : Promise.resolve([] as Profile[]),
    want("playlists") && yt ? searchPlaylists(q, big ? 18 : 6) : Promise.resolve([] as PlaylistResult[]),
    want("live") && yt ? searchLive(q, big ? 18 : 6) : Promise.resolve([] as VideoCard[]),
    want("live") && has("jacelive") ? jaceLiveSets(q) : Promise.resolve([] as JaceLiveSet[]),
  ]);
  const videos = await withDeArrow(interleave(jaceVids.filter((v) => !v.short), ytVids.filter((v) => !v.short)));
  const allShorts = await withDeArrow(interleave(jaceVids.filter((v) => v.short), shorts));
  const ranked = rankPosts(posts, taste, 40);
  const nothing = ![ranked, news, videos, allShorts, channels, people, jacePeople, playlists, live, sets].some((x) => x.length);
  const cap = <T,>(list: T[], n: number) => (big ? list : list.slice(0, n));

  const chip = (active: boolean) =>
    `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-foreground text-background" : "bg-foreground/[.07] hover:bg-foreground/[.12]"}`;
  const platformChip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-foreground"}`;
  const more = (t: Type, label: string) =>
    !big && (
      <Link href={href({ type: t })} className="self-start text-sm text-accent hover:underline">
        {label}
      </Link>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Results for &quot;{q}&quot;</h1>
        <nav aria-label="What to find" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {TYPES.map((t) => (
            <Link key={t.id} href={href({ type: t.id })} aria-current={t.id === type ? "page" : undefined} className={chip(t.id === type)}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div aria-label="Where to search" className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
          <span className="shrink-0 text-xs text-muted">Search on:</span>
          {enabled.map((s) => {
            const active = where.includes(s);
            const next = active ? where.filter((x) => x !== s) : [...where, s];
            const label = SERVICES.find((x) => x.id === s)?.label ?? s;
            return (
              <Link key={s} href={href({ on: next.length ? next : enabled })} aria-pressed={active} className={platformChip(active)}>
                {active ? "✓ " : ""}
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {(jacePeople.length > 0 || channels.length > 0 || people.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">{type === "channels" ? "Channels" : type === "people" ? "People" : "Channels and people"}</h2>
          <div className={big ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1"}>
            {jacePeople.map((p) => (
              <Link key={`jm:${p.sub}`} href={`/u/${encodeURIComponent(p.handle)}`} className={`flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 hover:border-foreground/25 ${big ? "" : "w-72 shrink-0"}`}>
                <Avatar name={p.name} src={p.picture} size={52} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted">@{p.handle} · Jace Media</span>
                </span>
              </Link>
            ))}
            {channels.map((c) => (
              <Link key={`yt:${c.id}`} href={`/channel/youtube/${c.id}`} className={`flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 hover:border-foreground/25 ${big ? "" : "w-72 shrink-0"}`}>
                <Avatar name={c.name} src={c.picture} size={52} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="line-clamp-2 text-xs text-muted">{c.description || "YouTube channel"}</span>
                </span>
              </Link>
            ))}
            {people.map((p) => (
              <Link key={p.href} href={p.href} className={`flex items-center gap-3 rounded-2xl border border-line bg-panel p-3 hover:border-foreground/25 ${big ? "" : "w-72 shrink-0"}`}>
                <Avatar name={p.name} src={p.picture} size={52} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    <NetworkBadge network={p.network === "lemmy-user" ? "lemmy" : (p.network as "bluesky" | "mastodon" | "lemmy" | "hackernews")} />
                    <span className="truncate">{p.handle}</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Videos</h2>
          <VideoGrid videos={cap(videos, 6)} />
          {videos.length > 6 && more("videos", "More videos")}
        </section>
      )}

      {allShorts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Shorts</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {cap(allShorts, 6).map((s) => (
              <Link key={`${s.source}:${s.id}`} href={`/shorts?v=${s.source}:${s.id}`} className="group">
                <div className="aspect-[9/16] overflow-hidden rounded-xl bg-panel">
                  {s.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{s.title}</p>
              </Link>
            ))}
          </div>
          {allShorts.length > 6 && more("shorts", "More Shorts")}
        </section>
      )}

      {playlists.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Playlists</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map((p) => (
              <Link key={p.id} href={`/playlist/youtube/${p.id}`} className="group flex flex-col gap-2">
                <div className="relative aspect-video overflow-hidden rounded-xl bg-panel">
                  {p.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                  )}
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">▶ Playlist</span>
                </div>
                <p className="line-clamp-2 font-medium">{p.title}</p>
                <p className="truncate text-sm text-muted">{p.channelName}</p>
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
            {cap(sets, 4).map((s) => (
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

      {has("youtube") && !hasYouTubeApi && want("videos", "shorts", "channels", "playlists", "live") && (
        <p className="text-sm text-muted">YouTube search needs a YouTube API key on this server. Paste any YouTube link to watch it.</p>
      )}

      {(ranked.length > 0 || news.length > 0) && (
        <div className="mx-auto grid w-full max-w-2xl gap-8">
          {ranked.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Posts</h2>
              <FeedList items={cap(ranked, 15)} />
              {ranked.length > 15 && more("posts", "More posts")}
            </section>
          )}
          {news.length > 0 && type !== "posts" && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">News</h2>
              <FeedList items={cap(news, 6)} />
              {news.length > 6 && more("news", "More news")}
            </section>
          )}
        </div>
      )}

      {nothing && <EmptyState title={`Nothing found for "${q}"`}>Try other words, another type, or more platforms.</EmptyState>}
    </div>
  );
}
