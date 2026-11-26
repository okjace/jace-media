import type { Metadata } from "next";
import Link from "next/link";
import { FollowButton } from "@/components/actions/FollowButton";
import { LibraryActions } from "@/components/LibraryActions";
import { Avatar } from "@/components/Avatar";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";
import { libraryCounts, listSubscriptions, recentHistory } from "@/lib/library";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library" };

const KIND: Record<string, string> = { youtube: "YouTube", jace: "Jace", bluesky: "Bluesky", mastodon: "Mastodon", lemmy: "Lemmy" };

export default async function LibraryPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title="Library">Sign in to see your subscriptions and watch history.</PageTitle>
        <a href="/api/auth/signin?next=/library" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      </div>
    );
  }
  const [counts, subs, history] = await Promise.all([libraryCounts(viewer.sub), listSubscriptions(viewer.sub), recentHistory(viewer.sub, 40)]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageTitle title="Library">What shapes your recommendations. Everything here is private to you.</PageTitle>
      <div className="flex flex-wrap gap-2">
        <Link href="/import" className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover">
          Import from YouTube
        </Link>
        <Link href="/services" className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
          Choose services
        </Link>
        <Link href="/feeds" className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
          Your feeds
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Following ({counts.subs})</h2>
        {subs.length === 0 ? (
          <p className="text-sm text-muted">Nobody yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-panel">
            {subs.map((s) => (
              <li key={`${s.kind}:${s.ref}`} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={s.name} src={s.picture} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted">{KIND[s.kind]}</span>
                </span>
                <FollowButton target={s} initial size="sm" label={s.kind === "youtube" ? "Subscribe" : "Follow"} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Watch history ({counts.history})</h2>
          <LibraryActions hidden={counts.hidden} />
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nothing watched yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={`${h.source}:${h.id}`}>
                <Link href={`/watch/${h.source}/${h.id}`} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-foreground/[.04]">
                  {h.source === "youtube" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/yt-thumb/${h.id}?s=mqdefault`} alt="" loading="lazy" className="aspect-video w-32 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex aspect-video w-32 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">▶</span>
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium">{h.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {[h.channelName, h.count > 1 ? `watched ${h.count} times` : null, timeAgo(new Date(h.watchedAt).toISOString())].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
