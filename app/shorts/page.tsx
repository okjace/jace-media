import type { Metadata } from "next";
import { EmptyState } from "@/components/videos/VideoGrid";
import { ShortsPlayer } from "@/components/videos/ShortsPlayer";
import { getExtensions } from "@/lib/prefs";
import { getTaste, recommendedVideos, videoCandidates } from "@/lib/recommend";
import type { VideoCard } from "@/lib/types";
import { withDeArrow } from "@/lib/ytextras";
import { filterVideos } from "@/lib/ratingfilter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shorts" };

/** Recommended Shorts from YouTube and Jace. ?v=source:id starts with that Short. */
export default async function ShortsPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const [taste, ext] = await Promise.all([getTaste(), getExtensions()]);
  if (ext.hideShorts) {
    return <EmptyState title="Shorts are hidden">The Hide Shorts extension is on. Turn it off in Extensions to see Shorts.</EmptyState>;
  }
  if (!taste.services.includes("youtube") && !taste.services.includes("jacevideos")) {
    return <EmptyState title="Shorts are turned off">Turn on YouTube or Jace videos in Choose services to see Shorts.</EmptyState>;
  }
  let shorts = await recommendedVideos({ shorts: true, limit: 60 });

  // Opening a particular Short puts it first, even if it wasn't in the recommendations.
  const [source, id] = (v ?? "").split(":");
  if ((source === "youtube" || source === "jace") && id) {
    const known = (await videoCandidates()).find((c) => c.source === source && c.id === id);
    const first: VideoCard = known ?? {
      source,
      id,
      title: "Short",
      thumbnail: source === "youtube" ? `/api/yt-thumb/${id}` : null,
      channelId: "",
      channelName: source === "youtube" ? "YouTube" : "Jace",
      publishedAt: null,
      short: true,
    };
    if (source === "youtube" || known) shorts = [first, ...shorts.filter((s) => !(s.source === source && s.id === id))];
  }

  if (shorts.length === 0) {
    return (
      <EmptyState title="No Shorts yet">
        Subscribe to some YouTube channels or import your YouTube data to fill this up. Jace videos tagged #shorts show here too.
      </EmptyState>
    );
  }
  shorts = await withDeArrow(await filterVideos(shorts));
  const followed = [...taste.following].filter((k) => k.startsWith("youtube:") || k.startsWith("jace:"));
  return <ShortsPlayer shorts={shorts} followed={followed} />;
}
