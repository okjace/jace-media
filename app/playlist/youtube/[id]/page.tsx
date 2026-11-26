import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/PageTitle";
import { EmptyState, VideoGrid } from "@/components/videos/VideoGrid";
import type { VideoCard } from "@/lib/types";
import { channelUploads, playlistInfo, PLAYLIST_ID } from "@/lib/youtube";
import { withDeArrow } from "@/lib/ytextras";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/playlist/youtube/[id]">): Promise<Metadata> {
  const info = await playlistInfo((await params).id);
  return { title: info?.title ?? "Playlist" };
}

/** A YouTube playlist inside Jace Media: every video, 50 at a time. */
export default async function YouTubePlaylistPage({ params, searchParams }: PageProps<"/playlist/youtube/[id]">) {
  const { id } = await params;
  if (!PLAYLIST_ID.test(id)) notFound();
  const pages = Math.max(1, Math.min(20, Number((await searchParams).pages) || 1));
  const info = await playlistInfo(id);
  if (!info) notFound();
  const videos: VideoCard[] = [];
  let token: string | undefined;
  let more = false;
  for (let i = 0; i < pages; i++) {
    const page = await channelUploads(id, token);
    if (!page) break;
    videos.push(...page.videos);
    token = page.next ?? undefined;
    more = !!page.next;
    if (!token) break;
  }
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={info.title}>
        <Link href={`/channel/youtube/${info.channelId}`} className="hover:text-foreground">
          {info.channelName}
        </Link>{" "}
        · {info.count} videos
      </PageTitle>
      {videos.length ? <VideoGrid videos={await withDeArrow(videos)} /> : <EmptyState title="This playlist is empty" />}
      {more && (
        <div className="flex justify-center">
          <Link href={`?pages=${pages + 1}`} scroll={false} className="rounded-full border border-line px-5 py-2 text-sm font-medium hover:bg-foreground/[.05]">
            Show more
          </Link>
        </div>
      )}
    </div>
  );
}
