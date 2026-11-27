import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Composer } from "@/components/feed/Composer";
import { PostCard } from "@/components/feed/PostCard";
import { getViewer } from "@/lib/auth";
import { isExtNetwork, listExtComments } from "@/lib/extcomments";
import { followKey, followTarget } from "@/lib/follow";
import { getTaste } from "@/lib/recommend";
import { filterPosts } from "@/lib/ratingfilter";
import { blueskyThread, hnThread, lemmyThread, mastodonThread, type Thread } from "@/lib/social";

export const dynamic = "force-dynamic";

const LABEL = { bluesky: "Bluesky", mastodon: "Mastodon", lemmy: "Lemmy", hackernews: "Hacker News", youtube: "YouTube" } as const;

async function load(network: string, id: string): Promise<Thread | null> {
  switch (network) {
    case "bluesky":
      return id.startsWith("at://") ? blueskyThread(id) : null;
    case "mastodon":
      return /^\d+$/.test(id) ? mastodonThread(id) : null;
    case "lemmy":
      return lemmyThread(id);
    case "hackernews":
      return hnThread(id);
    default:
      return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/p/[network]/[postId]">): Promise<Metadata> {
  const { network, postId } = await params;
  const t = await load(network, decodeURIComponent(postId));
  return { title: t ? t.post.title ?? `${t.post.author.name} on ${LABEL[network as keyof typeof LABEL]}` : "Post" };
}

/** A post from another network, with its replies and Jace Media comments, without leaving the site. */
export default async function ExternalPostPage({ params }: PageProps<"/p/[network]/[postId]">) {
  const { network, postId } = await params;
  const id = decodeURIComponent(postId);
  if (!isExtNetwork(network) || network === "comment") notFound();
  const viewer = await getViewer();
  const [thread, comments, taste] = await Promise.all([
    load(network, id),
    listExtComments(network, id, viewer ? { sub: viewer.sub, isAdmin: viewer.isAdmin } : null).catch(() => []),
    getTaste(),
  ]);
  if (!thread) notFound();
  const okReplies = new Set((await filterPosts(thread.replies.map((r) => r.item))).map((p) => p.id));
  const replies = thread.replies.filter((r) => okReplies.has(r.item.id));
  const target = followTarget(thread.post);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PostCard item={thread.post} linkToThread={false} followed={!!target && taste.following.has(followKey(target))} />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Comments on Jace Media <span className="font-normal text-muted">{comments.length || ""}</span>
        </h2>
        <Composer extTarget={{ network, postId: id }} placeholder="Add a comment" />
        {comments.map((c) => (
          <PostCard key={c.id} item={c} variant="comment" />
        ))}
      </section>

      {replies.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">
            Replies on {LABEL[network]} <span className="font-normal text-muted">{replies.length}</span>
          </h2>
          {replies.map((r) => (
            <div key={`${r.item.network}:${r.item.id}`} style={{ marginLeft: `${Math.min(r.depth, 5) * 20}px` }} className={r.depth ? "border-l border-line pl-3" : ""}>
              <PostCard item={{ ...r.item, title: undefined }} variant="comment" />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
