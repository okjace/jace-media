import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedPage } from "@/components/feed/FeedPage";
import { SaveFeedCopy } from "@/components/ShareFeed";
import { getViewer } from "@/lib/auth";
import { buildFeed, getSharedFeed } from "@/lib/customfeeds";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/feeds/shared/[feedId]">): Promise<Metadata> {
  const feed = await getSharedFeed((await params).feedId).catch(() => null);
  return { title: feed ? `${feed.name} · shared feed` : "Shared feed" };
}

/** Someone's shared feed. It's built for whoever opens it (their subscriptions, their filters). */
export default async function SharedFeedPage({ params }: PageProps<"/feeds/shared/[feedId]">) {
  const feed = await getSharedFeed((await params).feedId);
  if (!feed) notFound();
  const [owner, viewer, entries] = await Promise.all([getProfile(feed.ownerSub).catch(() => null), getViewer(), buildFeed(feed.rules, 80)]);
  const mine = viewer?.sub === feed.ownerSub;
  return (
    <FeedPage
      feed={feed}
      entries={entries}
      readOnly={!mine}
      subtitle={`Shared by ${owner?.name ?? "someone on Jace Media"}`}
      actions={!mine ? <SaveFeedCopy feedId={feed.id} /> : null}
    />
  );
}
