import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MixedFeed } from "@/components/feed/MixedFeed";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";
import { buildFeed, getFeed } from "@/lib/customfeeds";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/feeds/[feedId]">): Promise<Metadata> {
  const viewer = await getViewer();
  const feed = viewer ? await getFeed(viewer.sub, (await params).feedId).catch(() => null) : null;
  return { title: feed?.name ?? "Feed" };
}

export default async function CustomFeedPage({ params }: PageProps<"/feeds/[feedId]">) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const feed = await getFeed(viewer.sub, (await params).feedId);
  if (!feed) notFound();
  const entries = await buildFeed(feed.rules, 80);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PageTitle title={feed.name}>
          {feed.rules.only === "subscriptions" ? "Only what you follow" : "From everywhere"} ·{" "}
          {feed.rules.sort === "latest" ? "newest first" : "recommended for you"}
        </PageTitle>
        <Link href={`/feeds?edit=${feed.id}`} className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
          Edit feed
        </Link>
      </div>
      <MixedFeed
        entries={entries}
        empty={feed.rules.only === "subscriptions" ? "Nothing new from the people and channels you follow." : "Nothing matches this feed right now."}
      />
    </div>
  );
}
