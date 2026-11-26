import type { Metadata } from "next";
import Link from "next/link";
import { FeedEditor } from "@/components/FeedEditor";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";
import { listFeeds } from "@/lib/customfeeds";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your feeds" };

export default async function FeedsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title="Your feeds">Sign in to make your own feeds, like &quot;Subscriptions only&quot; or &quot;Just Shorts&quot;.</PageTitle>
        <a href="/api/auth/signin?next=/feeds" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      </div>
    );
  }
  const { edit } = await searchParams;
  const feeds = await listFeeds(viewer.sub);
  const editing = feeds.find((f) => f.id === edit);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <PageTitle title={editing ? `Edit "${editing.name}"` : "Your feeds"}>
        Make feeds with just the services, people, and kinds of posts you want. Each one gets its own tab.
      </PageTitle>
      {!editing && feeds.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-panel">
          {feeds.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/feeds/${f.id}`} className="min-w-0 font-medium hover:underline">
                {f.name}
                <span className="block truncate text-xs font-normal text-muted">
                  {f.rules.only === "subscriptions" ? "Subscriptions only" : "Everything"} · {f.rules.content === "all" ? "posts and videos" : f.rules.content} ·{" "}
                  {f.rules.sort === "latest" ? "newest first" : "recommended"}
                </span>
              </Link>
              <Link href={`/feeds?edit=${f.id}`} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-foreground/[.05]">
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!editing && <h2 className="font-semibold">New feed</h2>}
      <FeedEditor key={editing?.id ?? "new"} feed={editing} />
    </div>
  );
}
