import type { Metadata } from "next";
import Link from "next/link";
import { MixedFeed } from "@/components/feed/MixedFeed";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";
import { buildFeed } from "@/lib/customfeeds";
import { listSubscriptions } from "@/lib/library";
import { getTaste } from "@/lib/recommend";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscriptions" };

const chip = (on: boolean) =>
  `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${on ? "bg-foreground text-background" : "bg-foreground/[.07] hover:bg-foreground/[.12]"}`;

/** Only what you follow, on every service you turned on, newest first. Folders narrow it down. */
export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle title="Subscriptions">Sign in to see new posts and videos from everyone you follow, in one place.</PageTitle>
        <a href="/api/auth/signin?next=/subscriptions" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      </div>
    );
  }
  const { folder: wanted } = await searchParams;
  const [taste, subs] = await Promise.all([getTaste(), listSubscriptions(viewer.sub)]);
  const folders = [...new Set(subs.map((s) => s.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
  const folder = wanted && folders.includes(wanted) ? wanted : null;
  const entries = await buildFeed(
    { services: taste.services, only: "subscriptions", content: "all", include: [], exclude: [], sort: "latest", folder },
    80,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <PageTitle title={folder ?? "Subscriptions"}>Only the channels, people, and communities you follow. Newest first.</PageTitle>
        <Link href="/subscriptions/manage" className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
          Manage
        </Link>
      </div>
      {folders.length > 0 && (
        <nav aria-label="Folders" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          <Link href="/subscriptions" className={chip(!folder)}>
            All
          </Link>
          {folders.map((f) => (
            <Link key={f} href={`/subscriptions?folder=${encodeURIComponent(f)}`} className={chip(f === folder)}>
              📁 {f}
            </Link>
          ))}
        </nav>
      )}
      <MixedFeed
        entries={entries}
        empty={
          subs.length === 0 ? (
            <>
              You don&apos;t follow anyone yet. Press <b>Follow</b> on posts and <b>Subscribe</b> on videos, or{" "}
              <Link href="/import" className="text-accent hover:underline">
                import your YouTube subscriptions
              </Link>
              .
            </>
          ) : (
            "Nothing new here yet."
          )
        }
      />
    </div>
  );
}
