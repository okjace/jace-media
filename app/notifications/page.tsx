import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { listNotifications, markAllRead, type NotificationKind } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

const WHAT: Record<NotificationKind, { icon: string; text: string }> = {
  reply: { icon: "💬", text: "replied to your post" },
  like: { icon: "♥", text: "liked your post" },
  repost: { icon: "↻", text: "reposted your post" },
  quote: { icon: "❝", text: "quoted your post" },
  follow: { icon: "＋", text: "followed you" },
};

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title="Notifications">Sign in to see replies, likes, and new followers.</PageTitle>
        <a href="/api/auth/signin?next=/notifications" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      </div>
    );
  }
  const items = await listNotifications(viewer.sub);
  // Opening the page reads them all (the list above still shows which were new).
  await markAllRead(viewer.sub);
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Notifications" />
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">Nothing yet. Post something!</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
          {items.map((n) => (
            <li key={n.id} className={n.read ? "" : "bg-accent/[.06]"}>
              <Link
                href={n.postId ? `/post/${n.postId}` : `/u/${encodeURIComponent(n.actor.handle)}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-foreground/[.03]"
              >
                <span className="w-5 pt-2 text-center text-accent" aria-hidden="true">
                  {WHAT[n.kind].icon}
                </span>
                <Avatar name={n.actor.name} src={n.actor.picture} size={36} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{n.actor.name}</span> {WHAT[n.kind].text}
                  <span className="text-muted"> · {timeAgo(n.createdAt)}</span>
                  {n.postText && <span className="mt-1 block truncate text-muted">{n.postText}</span>}
                </span>
                {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
