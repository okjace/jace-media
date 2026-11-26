import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/PageTitle";
import { EmptyState, VideoGrid } from "@/components/videos/VideoGrid";
import { interleave, jaceVideos } from "@/lib/data";
import { getTaste, latestVideos, rankVideos, videoCandidates } from "@/lib/recommend";
import { hasYouTubeApi, parseYouTubeVideo, search } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Videos" };

type Source = "all" | "jace" | "youtube";

/** Recommended (or newest) videos from YouTube and Jace, with search. */
export default async function VideosPage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string; sort?: string }> }) {
  const sp = await searchParams;
  const taste = await getTaste();
  const allowed: Source[] = ["all", ...(taste.services.includes("jacevideos") ? (["jace"] as const) : []), ...(taste.services.includes("youtube") ? (["youtube"] as const) : [])];
  const source: Source = allowed.includes(sp.source as Source) ? (sp.source as Source) : "all";
  const sort = sp.sort === "latest" ? "latest" : "recommended";
  const q = sp.q?.trim().slice(0, 200) || "";

  // A pasted YouTube link opens the video straight away.
  const linked = q ? parseYouTubeVideo(q) : null;
  if (linked) redirect(`/watch/youtube/${linked}`);

  const wantJace = source !== "youtube" && taste.services.includes("jacevideos");
  const wantYouTube = source !== "jace" && taste.services.includes("youtube");

  let videos;
  if (q) {
    const [jace, yt] = await Promise.all([
      wantJace ? jaceVideos({ q, limit: 24 }).then((r) => r.videos) : Promise.resolve([]),
      wantYouTube ? search(q, 24).then((r) => r ?? []) : Promise.resolve([]),
    ]);
    videos = interleave(jace, yt);
  } else {
    const pool = (await videoCandidates()).filter(
      (v) => !v.short && ((v.source === "jace" && wantJace) || (v.source === "youtube" && wantYouTube)),
    );
    videos = sort === "latest" ? latestVideos(pool, taste, 48) : rankVideos(pool, taste, 48);
  }

  const chip = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm ${active ? "bg-foreground text-background" : "bg-foreground/[.06] hover:bg-foreground/[.1]"}`;
  const href = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ ...(source !== "all" ? { source } : {}), ...(sort !== "recommended" ? { sort } : {}), ...(q ? { q } : {}), ...patch });
    for (const [k, v] of [...params]) if (v === "all" || v === "recommended" || v === "") params.delete(k);
    return `/videos${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Videos">YouTube and Jace videos picked for you, with no ads added by Jace Media.</PageTitle>
      <form role="search" className="flex gap-2">
        {source !== "all" && <input type="hidden" name="source" value={source} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search videos, or paste a YouTube link"
          aria-label="Search videos"
          className="h-10 flex-1 rounded-full border border-line bg-panel px-4 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button className="rounded-full border border-line px-4 text-sm hover:bg-foreground/[.05]">Search</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {allowed.length > 2 &&
          allowed.map((s) => (
            <Link key={s} href={href({ source: s })} aria-current={s === source ? "page" : undefined} className={chip(s === source)}>
              {s === "all" ? "All" : s === "jace" ? "Jace" : "YouTube"}
            </Link>
          ))}
        {!q && (
          <>
            <span className="mx-1 w-px self-stretch bg-line" aria-hidden="true" />
            <Link href={href({ sort: "recommended" })} className={chip(sort === "recommended")}>Recommended</Link>
            <Link href={href({ sort: "latest" })} className={chip(sort === "latest")}>Newest</Link>
          </>
        )}
      </div>
      {q && wantYouTube && !hasYouTubeApi && (
        <p className="text-sm text-muted">Searching YouTube needs a YouTube API key on this server. Paste a YouTube link to watch any video.</p>
      )}
      {videos.length > 0 ? (
        <VideoGrid videos={videos} />
      ) : (
        <EmptyState title={q ? `No videos match "${q}"` : "No videos right now"}>
          {q ? "Try another search." : "Turn on YouTube or Jace videos in Choose services, or import your YouTube data."}
        </EmptyState>
      )}
    </div>
  );
}
