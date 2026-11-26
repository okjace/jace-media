import Link from "next/link";
import { VideoMenu } from "@/components/actions/VideoMenu";
import { Avatar } from "@/components/Avatar";
import { channelHref, duration, timeAgo, views, watchHref } from "@/lib/format";
import type { VideoCard } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";
import { filterVideos } from "@/lib/ratingfilter";

export { SourceBadge };

function Thumbnail({ video, className = "" }: { video: VideoCard; className?: string }) {
  const length = duration(video.duration);
  return (
    <div className={`relative aspect-video overflow-hidden rounded-xl bg-panel ${className}`}>
      {video.thumbnail ? (
        // Thumbnails come from YouTube and Jace's storage, so a plain <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/25 to-panel">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-accent" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </div>
      )}
      <span className="absolute left-2 top-2">
        <SourceBadge source={video.source} />
      </span>
      {video.visibility && video.visibility !== "public" && (
        <span className="absolute right-2 top-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium capitalize text-white">
          {video.visibility}
        </span>
      )}
      {length && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
          {length}
        </span>
      )}
    </div>
  );
}

function Meta({ video }: { video: VideoCard }) {
  return [views(video.views), timeAgo(video.publishedAt)].filter(Boolean).join(" · ");
}

export function VideoTile({ video }: { video: VideoCard }) {
  return (
    <div data-video-tile className="group flex flex-col gap-3">
      <Link href={watchHref(video)} aria-label={video.title}>
        <Thumbnail video={video} />
      </Link>
      <div className="flex gap-3">
        {video.source === "jace" && (
          <Link href={channelHref(video)} className="mt-0.5 shrink-0" tabIndex={-1} aria-hidden="true">
            <Avatar name={video.channelName} src={video.channelPicture} size={36} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <Link href={watchHref(video)} className="line-clamp-2 font-medium leading-snug">
            {video.title}
          </Link>
          <Link href={channelHref(video)} className="mt-1 block truncate text-sm text-muted hover:text-foreground">
            {video.channelName}
          </Link>
          <p className="text-sm text-muted">
            <Meta video={video} />
          </p>
        </div>
        <VideoMenu source={video.source} id={video.id} channelId={video.channelId} channelName={video.channelName} title={video.title} thumbnail={video.thumbnail} short={video.short} />
      </div>
    </div>
  );
}

/** A grid of videos, with the content rating applied. */
export async function VideoGrid({ videos: all }: { videos: VideoCard[] }) {
  const videos = await filterVideos(all);
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <VideoTile key={`${v.source}:${v.id}`} video={v} />
      ))}
    </div>
  );
}

/** A compact row, for "Up next" and search results on small screens. */
export function VideoRow({ video }: { video: VideoCard }) {
  return (
    <Link data-video-tile href={watchHref(video)} className="group flex gap-2.5">
      <Thumbnail video={video} className="w-40 shrink-0 rounded-lg" />
      <div className="min-w-0 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</p>
        <p className="mt-1 truncate text-xs text-muted">{video.channelName}</p>
        <p className="text-xs text-muted">
          <Meta video={video} />
        </p>
      </div>
    </Link>
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
