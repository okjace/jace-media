import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/PageTitle";
import { PlaylistActions } from "@/components/PlaylistActions";
import { EmptyState, VideoGrid } from "@/components/videos/VideoGrid";
import { getViewer } from "@/lib/auth";
import { getPlaylist } from "@/lib/playlists";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/playlists/[playlistId]">): Promise<Metadata> {
  const viewer = await getViewer();
  const data = viewer ? await getPlaylist(viewer.sub, (await params).playlistId).catch(() => null) : null;
  return { title: data?.playlist.name ?? "Playlist" };
}

export default async function PlaylistPage({ params }: PageProps<"/playlists/[playlistId]">) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const data = await getPlaylist(viewer.sub, (await params).playlistId);
  if (!data) notFound();
  const { playlist, videos } = data;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle title={playlist.kind === "watch_later" ? "Watch Later" : playlist.name}>
          {videos.length} video{videos.length === 1 ? "" : "s"}
        </PageTitle>
        {playlist.kind === "playlist" && <PlaylistActions id={playlist.id} name={playlist.name} />}
      </div>
      {videos.length ? <VideoGrid videos={videos} /> : <EmptyState title="Nothing saved yet">Press Save under any video, or use its ⋮ menu.</EmptyState>}
    </div>
  );
}
