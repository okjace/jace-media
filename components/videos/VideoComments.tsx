import { Avatar } from "@/components/Avatar";
import { Composer } from "@/components/feed/Composer";
import { PostCard } from "@/components/feed/PostCard";
import { RichText } from "@/components/feed/RichText";
import { getViewer } from "@/lib/auth";
import { listExtComments } from "@/lib/extcomments";
import { timeAgo } from "@/lib/format";
import { filterPosts } from "@/lib/ratingfilter";
import type { JaceVideoDetail } from "@/lib/types";
import { youtubeComments } from "@/lib/youtube";
import { textBlocked } from "@/lib/rating";
import { getExtensions } from "@/lib/prefs";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function Comment({ name, picture, text, when, likes, pinned }: { name: string; picture: string | null; text: string; when: string; likes?: number; pinned?: boolean }) {
  return (
    <li className="flex gap-3">
      <Avatar name={name} src={picture} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{name}</span> <span className="text-muted">· {timeAgo(when)}</span>
          {pinned && <span className="ml-2 text-xs text-accent">📌 Pinned</span>}
        </p>
        <RichText text={text} className="mt-0.5 text-[15px] leading-relaxed" />
        {likes ? <p className="mt-1 text-xs text-muted">♡ {compact.format(likes)}</p> : null}
      </div>
    </li>
  );
}

/**
 * Comments under a video. Jace videos: Jace's own comments (and yours go to Jace).
 * YouTube videos: comments from people on Jace Media, plus YouTube's own
 * comments when the server has a YouTube API key.
 */
export async function VideoComments({ source, id, jace }: { source: "youtube" | "jace"; id: string; jace?: JaceVideoDetail }) {
  const viewer = await getViewer();
  const ext = await getExtensions();

  if (source === "jace") {
    const list = (jace?.comments ?? []).filter((c) => !textBlocked(c.body, ext.rating));
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">
          {list.length} comment{list.length === 1 ? "" : "s"}
        </h2>
        <Composer extTarget={{ network: "jace", postId: id, endpoint: "/api/jace-comments" }} placeholder="Add a comment" />
        <ul className="flex flex-col gap-5">
          {[...list]
            .sort((a, b) => Number(b.pinned) - Number(a.pinned))
            .map((c) => (
              <Comment key={c.id} name={c.author_name} picture={null} text={c.body} when={c.created_at} pinned={c.pinned} />
            ))}
        </ul>
      </section>
    );
  }

  const [mine, theirs] = await Promise.all([
    listExtComments("youtube", id, viewer ? { sub: viewer.sub, isAdmin: viewer.isAdmin } : null)
      .then(filterPosts)
      .catch(() => []),
    youtubeComments(id),
  ]);
  const yt = (theirs ?? []).filter((c) => !textBlocked(c.text, ext.rating));
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Comments</h2>
      <Composer extTarget={{ network: "youtube", postId: id }} placeholder="Add a comment on Jace Media" />
      {mine.length > 0 && (
        <div className="flex flex-col gap-2">
          {mine.map((c) => (
            <PostCard key={c.id} item={c} variant="comment" />
          ))}
        </div>
      )}
      {theirs === null ? (
        mine.length === 0 && <p className="text-sm text-muted">No comments on Jace Media yet. Be the first!</p>
      ) : (
        <>
          <h3 className="mt-2 text-sm font-semibold text-muted">On YouTube</h3>
          <ul className="flex flex-col gap-5">
            {yt.map((c) => (
              <Comment key={c.id} name={c.author} picture={null} text={c.text} when={c.publishedAt} likes={ext.hideCounts ? 0 : c.likes} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
