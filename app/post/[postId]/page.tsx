import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Composer } from "@/components/feed/Composer";
import { FeedList } from "@/components/feed/FeedList";
import { PostCard } from "@/components/feed/PostCard";
import { getViewer } from "@/lib/auth";
import { getThread } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: PageProps<"/post/[postId]">) {
  const { postId } = await params;
  const viewer = await getViewer();
  const thread = await getThread(viewer ? { sub: viewer.sub, isAdmin: viewer.isAdmin } : null, postId).catch(() => null);
  if (!thread) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={thread.parent ? thread.parent.url : "/jace"} className="text-sm text-muted hover:text-foreground">
        ← {thread.parent ? "Replying to" : "Back to Jace"}
      </Link>
      {thread.parent && (
        <div className="opacity-80">
          <PostCard item={thread.parent} />
        </div>
      )}
      <div className="rounded-[20px] ring-2 ring-accent/40">
        <PostCard item={thread.post} linkToThread={false} />
      </div>
      <Composer parentId={thread.post.id} placeholder={`Reply to @${thread.post.author.handle}`} />
      <h2 className="mt-2 font-semibold">Replies</h2>
      <FeedList items={thread.replies} empty="No replies yet." />
    </div>
  );
}
