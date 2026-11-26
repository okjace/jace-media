import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";
import { listPlaylists } from "@/lib/playlists";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Playlists" };

export default async function PlaylistsPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title="Playlists">Sign in to save videos to Watch Later and your own playlists.</PageTitle>
        <a href="/api/auth/signin?next=/playlists" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      </div>
    );
  }
  const playlists = await listPlaylists(viewer.sub);
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Playlists">Press Save on any video to add it to one.</PageTitle>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {playlists.map((p) => (
          <Link key={p.id} href={`/playlists/${p.kind === "watch_later" ? "watch-later" : p.id}`} className="group flex flex-col gap-2">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-panel">
              {p.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
              ) : (
                <div className="flex h-full items-center justify-center text-3xl">{p.kind === "watch_later" ? "🕒" : "📃"}</div>
              )}
              <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                {p.count} video{p.count === 1 ? "" : "s"}
              </span>
            </div>
            <p className="font-medium">{p.kind === "watch_later" ? "Watch Later" : p.name}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
