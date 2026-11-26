import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/actions/FollowButton";
import { Avatar } from "@/components/Avatar";
import { FeedList } from "@/components/feed/FeedList";
import { getViewer } from "@/lib/auth";
import { jacePosts } from "@/lib/feeds";
import { postCount } from "@/lib/posts";
import { getProfileByHandle } from "@/lib/profiles";
import { getTaste } from "@/lib/recommend";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const profile = await getProfileByHandle(decodeURIComponent((await params).handle)).catch(() => null);
  return { title: profile ? `${profile.name} (@${profile.handle})` : "Profile" };
}

export default async function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  const handle = decodeURIComponent((await params).handle);
  const profile = await getProfileByHandle(handle).catch(() => null);
  if (!profile || profile.banned) notFound();
  const [viewer, posts, total] = await Promise.all([getViewer(), jacePosts({ authorSub: profile.sub, limit: 50 }), postCount(profile.sub)]);
  const mine = viewer?.sub === profile.sub;
  const following = (await getTaste()).following.has(`jace:${profile.sub.toLowerCase()}`);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="h-24 bg-gradient-to-r from-accent/40 via-accent/15 to-panel" />
        <div className="-mt-10 flex flex-col gap-3 px-5 pb-5">
          <div className="flex items-end justify-between gap-3">
            <span className="rounded-full border-4 border-panel">
              <Avatar name={profile.name} src={profile.picture} size={88} />
            </span>
            {!mine && <FollowButton target={{ kind: "jace", ref: profile.sub, name: profile.name, picture: profile.picture }} initial={following} />}
            {mine && (
              <Link href="/settings" className="rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:bg-foreground/[.05]">
                Edit profile
              </Link>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{profile.name}</h1>
            <p className="text-sm text-muted">@{profile.handle}</p>
          </div>
          {profile.bio && <p className="whitespace-pre-wrap text-[15px]">{profile.bio}</p>}
          <p className="text-sm text-muted">
            <span className="font-semibold text-foreground">{total}</span> post{total === 1 ? "" : "s"} ·{" "}
            <a href={`https://jaceo.vercel.app/profile/${profile.sub}`} className="text-accent hover:underline">
              Jace profile ↗
            </a>
          </p>
        </div>
      </section>
      <FeedList items={posts.items} empty={mine ? "You haven't posted yet." : "No posts yet."} />
    </div>
  );
}
