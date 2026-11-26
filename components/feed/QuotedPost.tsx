import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { timeAgo } from "@/lib/format";
import { postHref } from "@/lib/links";
import type { FeedItem } from "@/lib/types";
import { NetworkBadge } from "./NetworkBadge";

/** A post shown inside another post (a quote), opening in Jace Media. */
export function QuotedPost({ item }: { item: FeedItem }) {
  const image = item.media[0];
  return (
    <Link href={postHref(item)} className="block rounded-xl border border-line p-3 transition-colors hover:bg-foreground/[.03]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 text-sm">
        <Avatar name={item.author.name} src={item.author.picture} size={20} />
        <span className="truncate font-semibold">{item.author.name}</span>
        <span className="truncate text-muted">{item.network === "jace" ? `@${item.author.handle}` : item.author.handle}</span>
        <span className="shrink-0 text-xs text-muted">· {timeAgo(item.createdAt)}</span>
        <span className="ml-auto shrink-0">
          <NetworkBadge network={item.network} />
        </span>
      </div>
      {item.title && <p className="mt-1.5 font-semibold leading-snug">{item.title}</p>}
      {item.text && <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm">{item.text}</p>}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.thumb ?? image.url} alt={image.alt ?? ""} loading="lazy" referrerPolicy="no-referrer" className="mt-2 max-h-60 w-full rounded-lg object-cover" />
      )}
    </Link>
  );
}
