import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { SourceBadge, VideoRow } from "@/components/videos/VideoGrid";
import { Description } from "@/components/videos/Description";
import { VideoComments } from "@/components/videos/VideoComments";
import { FollowButton } from "@/components/actions/FollowButton";
import { ChannelHold } from "@/components/actions/ChannelHold";
import { RecordWatch } from "@/components/actions/RecordWatch";
import { SaveButton } from "@/components/actions/SaveButton";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { VideoVotes } from "@/components/actions/VideoVotes";
import { getViewer } from "@/lib/auth";
import { jaceVideo } from "@/lib/data";
import { count, date, downloadHref, timeAgo, watchHref } from "@/lib/format";
import { dislikeCount, videoVote } from "@/lib/library";
import { filterVideos } from "@/lib/ratingfilter";
import { getTaste, recommendedVideos } from "@/lib/recommend";

export async function generateMetadata({ params }: PageProps<"/watch/jace/[videoId]">): Promise<Metadata> {
  const video = await jaceVideo((await params).videoId);
  return { title: video?.title ?? "Jace video" };
}

/** Jace videos play straight from Jace's storage in the browser's own player. No ads, ever. */
export default async function JaceWatchPage({ params, searchParams }: PageProps<"/watch/jace/[videoId]">) {
  const { videoId } = await params;
  const autoStart = (await searchParams).play === "1";
  const video = await jaceVideo(videoId);
  if (!video) notFound();
  const [taste, viewer, upNext] = await Promise.all([getTaste(), getViewer(), recommendedVideos({ limit: 16, exclude: video.id }).then(filterVideos)]);
  const [myVote, dislikes] = await Promise.all([
    viewer ? videoVote(viewer.sub, "jace", video.id).catch(() => 0 as const) : Promise.resolve(0 as const),
    dislikeCount("jace", video.id).catch(() => 0),
  ]);
  const following = taste.following.has(`jace:${video.owner_id.toLowerCase()}`);

  return (
    <div className="flex flex-col gap-6 pb-6 lg:flex-row">
      <RecordWatch source="jace" id={video.id} title={video.title} channelId={video.owner_id} channelName={video.owner_name} thumbnail={video.thumbnail_url} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="-mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-2xl">
          <VideoPlayer
            key={video.id}
            source="jace"
            id={video.id}
            src={video.url}
            poster={video.thumbnail_url}
            title={video.title}
            autoStart={autoStart}
            href={`/watch/jace/${video.id}`}
            nextHref={upNext[0] ? watchHref(upNext[0]) : null}
            nextTitle={upNext[0]?.title ?? null}
          />
        </div>
        <h1 className="text-xl font-semibold leading-snug">{video.title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChannelHold
            target={{ kind: "jace", ref: video.owner_id, name: video.owner_name, picture: video.owner_picture }}
            initial={following}
            href={`/channel/jace/${video.owner_id}`}
            className="flex min-w-0 items-center gap-3"
          >
            <a href={`/channel/jace/${video.owner_id}`} className="flex min-w-0 items-center gap-3">
              <Avatar name={video.owner_name} src={video.owner_picture} size={40} />
              <div className="min-w-0">
                <p className="truncate font-medium">{video.owner_name}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <SourceBadge source="jace" /> on Jace
                </p>
              </div>
            </a>
            {/* Computers: Subscribe next to the channel. Phones: press and hold the channel. */}
            {video.owner_type === "user" && viewer?.sub !== video.owner_id && (
              <span className="hidden sm:block">
                <FollowButton
                  target={{ kind: "jace", ref: video.owner_id, name: video.owner_name, picture: video.owner_picture }}
                  initial={following}
                  label="Subscribe"
                />
              </span>
            )}
          </ChannelHold>
          <div className="flex flex-wrap items-center gap-2">
            <VideoVotes
              source="jace"
              id={video.id}
              channelId={video.owner_id}
              initial={myVote}
              likes={Math.max(0, video.likes - (video.liked_by_me ? 1 : 0))}
              dislikes={Math.max(0, dislikes - (myVote === -1 ? 1 : 0))}
            />
            <SaveButton
              video={{ source: "jace", id: video.id, title: video.title, thumbnail: video.thumbnail_url, channelId: video.owner_id, channelName: video.owner_name, publishedAt: null }}
            />
            <a
              href={downloadHref(video.url, video.title)}
              download
              className="flex h-9 items-center gap-1.5 rounded-full bg-foreground/[.07] px-4 text-sm font-medium transition-colors hover:bg-foreground/[.12]"
            >
              <span aria-hidden="true">⬇</span> Download
            </a>
          </div>
        </div>
        <Description
          meta={[count(video.likes, "like"), count(video.comment_count, "comment"), `${date(video.created_at)} (${timeAgo(video.created_at)})`].join(
            " · ",
          )}
          text={video.description}
        />
        <VideoComments source="jace" id={video.id} jace={video} />
      </div>
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[360px]">
        <h2 className="font-semibold">Up next</h2>
        {upNext.length > 0 ? upNext.map((v) => <VideoRow key={v.id} video={v} />) : <p className="text-sm text-muted">Nothing else yet.</p>}
      </aside>
    </div>
  );
}
