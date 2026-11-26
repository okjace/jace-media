import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveViewer } from "@/components/live/LiveViewer";
import { getViewer } from "@/lib/auth";
import { cloudflareAvailable, getStream, iceServers } from "@/lib/golive";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/live/watch/[streamId]">): Promise<Metadata> {
  const stream = await getStream((await params).streamId).catch(() => null);
  return { title: stream ? `${stream.live ? "🔴 " : ""}${stream.title}` : "Live" };
}

export default async function WatchLivePage({ params }: PageProps<"/live/watch/[streamId]">) {
  const { streamId } = await params;
  const stream = await getStream(streamId);
  if (!stream) notFound();
  const [viewer, useCloudflare, ice] = await Promise.all([getViewer(), cloudflareAvailable(), iceServers()]);
  return (
    <LiveViewer
      streamId={streamId}
      initial={{ stream, isHost: viewer?.sub === stream.hostSub, useCloudflare: stream.cloudflare && useCloudflare, iceServers: ice }}
    />
  );
}
