import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { watchHref } from "@/lib/format";
import { continueWatching } from "@/lib/playlists";

/** A row of videos you started and didn't finish (synced across devices). Renders nothing when there are none. */
export async function ContinueWatching() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const videos = await continueWatching(viewer.sub).catch(() => []);
  if (videos.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Continue watching</h2>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {videos.map((v) => (
          <Link key={`${v.source}:${v.id}`} href={watchHref(v)} className="group w-60 shrink-0">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-panel">
              {v.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnail} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
              )}
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                <div className="h-full bg-accent" style={{ width: `${Math.round(v.progress * 100)}%` }} />
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{v.title}</p>
            <p className="truncate text-xs text-muted">{v.channelName}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
