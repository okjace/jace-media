import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { MixedFeed } from "@/components/feed/MixedFeed";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";
import { buildFeed } from "@/lib/customfeeds";
import { listSubscriptions } from "@/lib/library";
import { getTaste } from "@/lib/recommend";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscriptions" };

const PLACE: Record<string, string> = {
  youtube: "https://www.youtube.com/channel/",
  bluesky: "https://bsky.app/profile/",
};

/** Only what you follow, on every service you turned on, newest first. */
export default async function SubscriptionsPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title="Subscriptions">Sign in to see new posts and videos from everyone you follow, in one place.</PageTitle>
        <a href="/api/auth/signin?next=/subscriptions" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      </div>
    );
  }
  const taste = await getTaste();
  const [subs, entries] = await Promise.all([
    listSubscriptions(viewer.sub),
    buildFeed({ services: taste.services, only: "subscriptions", content: "all", include: [], exclude: [], sort: "latest" }, 80),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageTitle title="Subscriptions">Only the channels, people, and communities you follow. Newest first.</PageTitle>
      {subs.length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {subs.slice(0, 60).map((s) => (
            <a
              key={`${s.kind}:${s.ref}`}
              href={PLACE[s.kind] ? `${PLACE[s.kind]}${s.ref}` : "/library"}
              title={`${s.name} (${s.kind})`}
              className="flex w-16 shrink-0 flex-col items-center gap-1 text-center"
            >
              <Avatar name={s.name} src={s.picture} size={48} />
              <span className="w-full truncate text-[11px] text-muted">{s.name}</span>
            </a>
          ))}
        </div>
      )}
      <MixedFeed
        entries={entries}
        empty={
          <>
            You don&apos;t follow anyone yet. Press <b>Follow</b> on posts and <b>Subscribe</b> on videos, or{" "}
            <Link href="/import" className="text-accent hover:underline">
              import your YouTube subscriptions
            </Link>
            .
          </>
        }
      />
    </div>
  );
}
