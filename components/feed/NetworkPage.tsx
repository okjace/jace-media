import { FeedList } from "@/components/feed/FeedList";
import { PageTitle, Unavailable } from "@/components/PageTitle";
import { getTaste, rankPosts } from "@/lib/recommend";
import { NETWORKS } from "@/lib/social";

const BLURB = {
  bluesky: "What's hot on Bluesky right now.",
  mastodon: "Trending posts on Mastodon.",
  lemmy: "Hot posts from across Lemmy.",
  hackernews: "The Hacker News front page.",
} as const;

/** One tab for one network. Posts link back to where they were posted. */
export async function NetworkPage({ network }: { network: keyof typeof NETWORKS }) {
  const n = NETWORKS[network];
  const [items, taste] = await Promise.all([n.load(40), getTaste()]);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageTitle title={n.label}>
        {BLURB[network]}{" "}
        <a href={n.site} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          Open {n.label} ↗
        </a>
      </PageTitle>
      {items === null && <Unavailable what={n.label} />}
      <FeedList items={rankPosts(items ?? [], taste, 40)} />
    </div>
  );
}
