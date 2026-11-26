import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedPage } from "@/components/feed/FeedPage";
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
  return <FeedPage feed={feed} entries={entries} />;
}
