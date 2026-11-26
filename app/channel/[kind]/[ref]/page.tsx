import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FollowButton } from "@/components/actions/FollowButton";
import { Avatar } from "@/components/Avatar";
import { FeedList } from "@/components/feed/FeedList";
import { EmptyState, VideoGrid } from "@/components/videos/VideoGrid";
import { getProfile } from "@/lib/profiles";
import { jaceVideos } from "@/lib/data";
import { getExtensions } from "@/lib/prefs";
import { getTaste } from "@/lib/recommend";
import { blueskyProfile, hnUserProfile, lemmyCommunityProfile, lemmyUserProfile, mastodonProfile, type ExtProfile } from "@/lib/social";
import type { FeedItem, VideoCard } from "@/lib/types";
import { withDeArrow } from "@/lib/ytextras";
import { fetchFeed } from "@/lib/rss";
import { channelFeed, CHANNEL_ID } from "@/lib/youtube";

export const dynamic = "force-dynamic";

const NETWORK_LABEL: Record<string, string> = {
  youtube: "YouTube",
  jace: "Jace",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  lemmy: "Lemmy community",
  "lemmy-user": "Lemmy",
  hackernews: "Hacker News",
  rss: "News & blogs",
};

type Loaded = { profile: ExtProfile | (Omit<ExtProfile, "network" | "follow"> & { network: string; follow: { kind: string; ref: string; name: string; picture: string | null } | null }); posts: FeedItem[]; videos: VideoCard[] };

async function load(kind: string, ref: string): Promise<Loaded | null> {
  switch (kind) {
    case "bluesky":
    case "mastodon":
    case "lemmy":
    case "lemmy-user":
    case "hackernews": {
      const fn = { bluesky: blueskyProfile, mastodon: mastodonProfile, lemmy: lemmyCommunityProfile, "lemmy-user": lemmyUserProfile, hackernews: hnUserProfile }[kind];
      const r = await fn(ref);
      return r ? { ...r, videos: [] } : null;
    }
    case "rss": {
      const feed = await fetchFeed(ref);
      if (!feed) return null;
      const host = (() => {
        try {
          return new URL(feed.site).hostname.replace(/^www\./, "");
        } catch {
          return "News site";
        }
      })();
      return {
        profile: {
          network: "rss",
          name: feed.title,
          handle: host,
          picture: feed.items[0]?.author.picture ?? null,
          banner: null,
          bio: "",
          stats: [],
          url: feed.site,
          follow: { kind: "rss", ref: feed.url, name: feed.title, picture: null },
        },
        posts: feed.items,
        videos: [],
      };
    }
    case "youtube": {
      if (!CHANNEL_ID.test(ref)) return null;
      const feed = await channelFeed(ref);
      if (!feed) return null;
      return {
        profile: {
          network: "youtube",
          name: feed.name,
          handle: "YouTube channel",
          picture: null,
          banner: null,
          bio: "",
          stats: [],
          url: `https://www.youtube.com/channel/${ref}`,
          follow: { kind: "youtube", ref, name: feed.name, picture: null },
        },
        posts: [],
        videos: feed.videos,
      };
    }
    case "jace": {
      const videos = (await jaceVideos({ limit: 100 })).videos.filter((v) => v.channelId === ref);
      const name = videos[0]?.channelName ?? "Jace channel";
      return {
        profile: {
          network: "jace",
          name,
          handle: "Jace",
          picture: videos[0]?.channelPicture ?? null,
          banner: null,
          bio: "",
          stats: [],
          url: `https://jaceo.vercel.app/profile/${ref}`,
          follow: { kind: "jace", ref, name, picture: videos[0]?.channelPicture ?? null },
        },
        posts: [],
        videos,
      };
    }
    default:
      return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/channel/[kind]/[ref]">): Promise<Metadata> {
  const { kind, ref } = await params;
  const r = await load(kind, decodeURIComponent(ref)).catch(() => null);
  return { title: r?.profile.name ?? "Profile" };
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Anyone's profile, from any network, inside Jace Media. */
export default async function ChannelPage({ params, searchParams }: PageProps<"/channel/[kind]/[ref]">) {
  const { kind, ref: rawRef } = await params;
  const ref = decodeURIComponent(rawRef);
  // Jace people with a Jace Media profile have a full profile page.
  if (kind === "jace") {
    const p = await getProfile(ref).catch(() => null);
    if (p) redirect(`/u/${encodeURIComponent(p.handle)}`);
  }
  const [data, taste, ext] = await Promise.all([load(kind, ref), getTaste(), getExtensions()]);
  if (!data) notFound();
  const { profile } = data;
  const tab = (await searchParams).tab === "shorts" ? "shorts" : "videos";
  const hasShorts = data.videos.some((v) => v.short) && !ext.hideShorts;
  const videos = await withDeArrow(data.videos.filter((v) => (tab === "shorts" ? v.short : !v.short)));
  const followed = !!profile.follow && taste.following.has(`${profile.follow.kind}:${profile.follow.ref.toLowerCase()}`);
  const chip = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium ${on ? "bg-foreground text-background" : "bg-foreground/[.07] hover:bg-foreground/[.12]"}`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <section className="overflow-hidden rounded-2xl border border-line bg-panel">
        {profile.banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.banner} alt="" referrerPolicy="no-referrer" className="h-36 w-full object-cover sm:h-44" />
        ) : (
          <div className="h-24 bg-gradient-to-r from-accent/35 via-accent/10 to-panel" />
        )}
        <div className="-mt-10 flex flex-col gap-3 px-5 pb-5">
          <div className="flex items-end justify-between gap-3">
            <span className="rounded-full border-4 border-panel bg-panel">
              <Avatar name={profile.name} src={profile.picture} size={88} />
            </span>
            {profile.follow && (
              <FollowButton target={profile.follow as never} initial={followed} label={kind === "youtube" || kind === "jace" ? "Subscribe" : "Follow"} />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{profile.name}</h1>
            <p className="text-sm text-muted">
              {profile.handle} · {NETWORK_LABEL[kind]}
            </p>
          </div>
          {profile.bio && <p className="max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed">{profile.bio.slice(0, 600)}</p>}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {!ext.hideCounts &&
              profile.stats.map((s) => (
                <span key={s.label}>
                  <b className="font-semibold text-foreground">{compact.format(s.value)}</b> {s.label}
                </span>
              ))}
            <a href={profile.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              {kind === "rss" ? "Visit site" : `Open on ${NETWORK_LABEL[kind].replace(" community", "")}`} ↗
            </a>
          </p>
        </div>
      </section>

      {data.videos.length > 0 && (
        <section className="flex flex-col gap-4">
          {hasShorts && (
            <div className="flex gap-2">
              <Link href="?tab=videos" className={chip(tab === "videos")}>
                Videos
              </Link>
              <Link href="?tab=shorts" className={chip(tab === "shorts")}>
                Shorts
              </Link>
            </div>
          )}
          {videos.length ? <VideoGrid videos={videos} /> : <EmptyState title="Nothing here yet" />}
        </section>
      )}
      {data.posts.length > 0 && (
        <div className="mx-auto w-full max-w-2xl">
          <FeedList items={data.posts} />
        </div>
      )}
      {data.posts.length === 0 && data.videos.length === 0 && <EmptyState title="No posts yet" />}
    </div>
  );
}
