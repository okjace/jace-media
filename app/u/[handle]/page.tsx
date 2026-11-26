import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/actions/FollowButton";
import { UserAvatar } from "@/components/live/LiveHosts";
import { FeedList } from "@/components/feed/FeedList";
import { VideoGrid } from "@/components/videos/VideoGrid";
import { getViewer } from "@/lib/auth";
import { jaceVideosBy } from "@/lib/data";
import { jacePosts } from "@/lib/feeds";
import { postCount } from "@/lib/posts";
import { getProfileByHandle } from "@/lib/profiles";
import { getTaste } from "@/lib/recommend";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const profile = await getProfileByHandle(decodeURIComponent((await params).handle)).catch(() => null);
  return { title: profile ? `${profile.name} (@${profile.handle})` : "Profile" };
}

const TABS = [
  { id: "posts", label: "Posts" },
  { id: "videos", label: "Videos" },
  { id: "shorts", label: "Shorts" },
] as const;

/** Someone's Jace Media profile: their posts, and their Jace videos and Shorts. */
export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[handle]">) {
  const handle = decodeURIComponent((await params).handle);
  const profile = await getProfileByHandle(handle).catch(() => null);
  if (!profile || profile.banned) notFound();
  const [viewer, posts, total, videos, taste] = await Promise.all([
    getViewer(),
    jacePosts({ authorSub: profile.sub, limit: 50 }),
    postCount(profile.sub),
    jaceVideosBy(profile.sub),
    getTaste(),
  ]);
  const mine = viewer?.sub === profile.sub;
  const following = taste.following.has(`jace:${profile.sub.toLowerCase()}`);
  const longVideos = videos.filter((v) => !v.short);
  const shorts = videos.filter((v) => v.short);
  const counts = { posts: total, videos: longVideos.length, shorts: shorts.length };
  // Open on the tab that has something in it.
  const wanted = (await searchParams).tab;
  const tab = TABS.find((t) => t.id === wanted)?.id ?? (total === 0 && longVideos.length ? "videos" : "posts");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="h-24 bg-gradient-to-r from-accent/40 via-accent/15 to-panel" />
        <div className="-mt-10 flex flex-col gap-3 px-5 pb-5">
          <div className="flex items-end justify-between gap-3">
            <span className="rounded-full border-4 border-panel">
              <UserAvatar sub={profile.sub} name={profile.name} src={profile.picture} size={88} link />
            </span>
            {!mine && <FollowButton target={{ kind: "jace", ref: profile.sub, name: profile.name, picture: profile.picture }} initial={following} />}
            {mine && (
              <div className="flex gap-2">
                <Link href="/studio" className="rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:bg-foreground/[.05]">
                  Your videos
                </Link>
                <Link href="/settings" className="rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:bg-foreground/[.05]">
                  Edit profile
                </Link>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{profile.name}</h1>
            <p className="text-sm text-muted">@{profile.handle}</p>
          </div>
          {profile.bio && <p className="whitespace-pre-wrap text-[15px]">{profile.bio}</p>}
          <p className="text-sm text-muted">
            <a href={`https://jaceo.vercel.app/profile/${profile.sub}`} className="text-accent hover:underline">
              Jace profile ↗
            </a>
          </p>
        </div>
      </section>

      <nav aria-label="Profile sections" className="flex gap-2">
        {TABS.filter((t) => t.id === "posts" || counts[t.id] > 0).map((t) => (
          <Link
            key={t.id}
            href={`?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${t.id === tab ? "bg-foreground text-background" : "bg-foreground/[.07] hover:bg-foreground/[.12]"}`}
          >
            {t.label} <span className="opacity-60">{counts[t.id]}</span>
          </Link>
        ))}
      </nav>

      {tab === "posts" && (
        <div className="mx-auto w-full max-w-2xl">
          <FeedList items={posts.items} empty={mine ? "You haven't posted yet." : "No posts yet."} />
        </div>
      )}
      {tab === "videos" && <VideoGrid videos={longVideos} />}
      {tab === "shorts" && <VideoGrid videos={shorts} />}
    </div>
  );
}
