import type { Metadata } from "next";
import { Composer } from "@/components/feed/Composer";
import { FeedList } from "@/components/feed/FeedList";
import { PageTitle, Unavailable } from "@/components/PageTitle";
import Link from "next/link";
import { jacePosts } from "@/lib/feeds";
import { getTaste, rankPosts } from "@/lib/recommend";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jace" };

export default async function JacePage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const { q, sort } = await searchParams;
  const query = q?.trim().slice(0, 100) || undefined;
  const latest = sort === "latest" || !!query;
  const [{ items: posts, available }, taste] = await Promise.all([jacePosts({ limit: latest ? 50 : 100, q: query }), getTaste()]);
  const items = latest ? posts : rankPosts(posts, taste, 50);
  const chip = (on: boolean) => `rounded-full px-3.5 py-1.5 text-sm ${on ? "bg-foreground text-background" : "bg-foreground/[.06] hover:bg-foreground/[.1]"}`;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageTitle title="Jace">Posts from people on Jace Media.</PageTitle>
      {!available && <Unavailable what="Jace posts" />}
      <form role="search" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search Jace posts"
          aria-label="Search Jace posts"
          className="h-10 flex-1 rounded-full border border-line bg-panel px-4 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button className="rounded-full border border-line px-4 text-sm hover:bg-foreground/[.05]">Search</button>
      </form>
      {!query && (
        <div className="flex gap-2">
          <Link href="/jace" className={chip(!latest)}>Recommended</Link>
          <Link href="/jace?sort=latest" className={chip(latest)}>Newest</Link>
        </div>
      )}
      {!query && <Composer />}
      <FeedList items={items} empty={query ? `No Jace posts match "${query}".` : "No posts yet. Be the first!"} />
    </div>
  );
}
