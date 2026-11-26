import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceBadge, VideoRow } from "@/components/videos/VideoGrid";
import { Description } from "@/components/videos/Description";
import { VideoComments } from "@/components/videos/VideoComments";
import { FollowButton } from "@/components/actions/FollowButton";
import { RecordWatch } from "@/components/actions/RecordWatch";
import { SaveButton } from "@/components/actions/SaveButton";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { VideoVotes } from "@/components/actions/VideoVotes";
import { getViewer } from "@/lib/auth";
import { date, timeAgo, views, watchHref } from "@/lib/format";
import { sponsorSegments } from "@/lib/sponsorblock";
import { dislikes, withDeArrow } from "@/lib/ytextras";
import { videoVote } from "@/lib/library";
import { filterVideos } from "@/lib/ratingfilter";
import { getTaste, rankVideos, recommendedVideos } from "@/lib/recommend";
import { VIDEO_ID, channelFeed, videoDetail } from "@/lib/youtube";

export async function generateMetadata({ params }: PageProps<"/watch/youtube/[videoId]">): Promise<Metadata> {
  const detail = await videoDetail((await params).videoId);
  return { title: detail?.title ?? "YouTube video" };
}

/**
 * YouTube videos play in YouTube's privacy-enhanced player
 * (youtube-nocookie.com): no tracking cookies until you press play, no
 * personalized ads, and no "related videos" from other channels at the end.
 * Jace Media itself never adds ads.
 */
export default async function YouTubeWatchPage({ params, searchParams }: PageProps<"/watch/youtube/[videoId]">) {
  const { videoId } = await params;
  const autoStart = (await searchParams).play === "1";
  if (!VIDEO_ID.test(videoId)) notFound();
  const detail = await videoDetail(videoId);
  const title = detail?.title ?? "YouTube video";
  const channelName = detail?.channelName ?? "YouTube";
  const channelId = detail?.channelId ?? null;
  const [taste, viewer, channel, recommended, segments, votes] = await Promise.all([
    getTaste(),
    getViewer(),
    channelId ? channelFeed(channelId) : null,
    recommendedVideos({ limit: 20, exclude: videoId }),
    sponsorSegments(videoId),
    dislikes(videoId),
  ]);
  const myVote = viewer ? await videoVote(viewer.sub, "youtube", videoId).catch(() => 0 as const) : 0;
  const subscribed = !!channelId && taste.following.has(`youtube:${channelId.toLowerCase()}`);
  // Up next: a few more from this channel, then recommendations.
  const fromChannel = rankVideos(
    (channel?.videos ?? []).filter((v) => !v.short && v.id !== videoId),
    taste,
    4,
  );
  const seen = new Set([videoId]);
  const upNext = await withDeArrow(await filterVideos([...fromChannel, ...recommended].filter((v) => !seen.has(v.id) && seen.add(v.id)).slice(0, 16)));

  return (
    <div className="flex flex-col gap-6 pb-6 lg:flex-row">
      <RecordWatch source="youtube" id={videoId} title={title} channelId={channelId} channelName={channelName} thumbnail={`/api/yt-thumb/${videoId}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="-mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-2xl">
          <VideoPlayer
            key={videoId}
            source="youtube"
            id={videoId}
            title={title}
            segments={segments}
            autoStart={autoStart}
            href={`/watch/youtube/${videoId}`}
            nextHref={upNext[0] ? watchHref(upNext[0]) : null}
            nextTitle={upNext[0]?.title ?? null}
          />
        </div>
        <h1 className="text-xl font-semibold leading-snug">{title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              {detail?.channelId ? (
                <Link href={`/channel/youtube/${detail.channelId}`} className="block truncate font-medium hover:underline">
                  {channelName}
                </Link>
              ) : (
                <p className="truncate font-medium">{channelName}</p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <SourceBadge source="youtube" /> on YouTube
              </p>
            </div>
            {channelId && <FollowButton target={{ kind: "youtube", ref: channelId, name: channelName }} initial={subscribed} label="Subscribe" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VideoVotes
              source="youtube"
              id={videoId}
              channelId={channelId}
              initial={myVote}
              likes={detail?.likes ?? votes?.likes ?? null}
              dislikes={taste.ext.dislikes ? (votes?.dislikes ?? null) : null}
            />
            <SaveButton
              video={{ source: "youtube", id: videoId, title, thumbnail: `/api/yt-thumb/${videoId}`, channelId: channelId ?? "", channelName, publishedAt: null }}
            />
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center rounded-full bg-foreground/[.07] px-4 text-sm font-medium transition-colors hover:bg-foreground/[.12]"
            >
              Open on YouTube
            </a>
          </div>
        </div>
        <Description
          meta={[views(detail?.views), detail?.publishedAt ? `${date(detail.publishedAt)} (${timeAgo(detail.publishedAt)})` : null]
            .filter(Boolean)
            .join(" · ")}
          text={detail?.description ?? ""}
        />
        <VideoComments source="youtube" id={videoId} />
      </div>
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[360px]">
        <h2 className="font-semibold">Up next</h2>
        {upNext.map((v) => (
          <VideoRow key={v.id} video={v} />
        ))}
      </aside>
    </div>
  );
}
