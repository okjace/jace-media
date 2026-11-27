import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { commentLikes } from "@/lib/commentlikes";
import { jaceVideo } from "@/lib/data";
import { listExtComments, replyCounts } from "@/lib/extcomments";
import { getExtensions } from "@/lib/prefs";
import { getProfiles } from "@/lib/profiles";
import { textBlocked } from "@/lib/rating";
import { filterPosts } from "@/lib/ratingfilter";
import type { FeedItem } from "@/lib/types";
import { youtubeComments, youtubeReplies, ytImage } from "@/lib/youtube";

type Other = {
  id: string;
  key: string;
  name: string;
  picture: string | null;
  text: string;
  when: string;
  likes: number;
  liked: boolean;
  pinned: boolean;
  replies: number;
};

/** Adds Jace Media likes (and your own like) and Jace Media reply counts. */
async function decorate(list: Omit<Other, "liked">[], mine: FeedItem[], sub: string | null) {
  const keys = [...list.map((c) => c.key), ...mine.map((c) => `ext:${c.id}`)];
  const [likes, counts] = await Promise.all([commentLikes(keys, sub), replyCounts(keys)]);
  return {
    others: list.map((c) => {
      const l = likes.get(c.key);
      return { ...c, likes: c.likes + (l?.count ?? 0), liked: !!l?.mine, replies: c.replies + (counts.get(c.key) ?? 0) };
    }),
    mine: mine.map((c) => {
      const key = `ext:${c.id}`;
      const l = likes.get(key);
      return { ...c, key, likes: l?.count ?? 0, liked: !!l?.mine, replies: counts.get(key) ?? 0 };
    }),
  };
}

/**
 * A video's comments as data (Shorts panel, video page, apps).
 * ?source=youtube|jace&id=…
 *   jace:    Jace's own comments
 *   youtube: comments from people on Jace Media (mine) and YouTube's top comments
 * ?replies=<YouTube comment id>&key=<comment key>: a comment's replies, from YouTube and from Jace Media.
 * Every comment carries `key` (for /api/comment-likes and replying), `likes`, `liked` and `replies`.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const source = req.nextUrl.searchParams.get("source");
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const [viewer, ext] = await Promise.all([getViewer(), getExtensions()]);
  const sub = viewer?.sub ?? null;
  const hide = (n: number) => (ext.hideCounts ? 0 : n);

  const repliesTo = req.nextUrl.searchParams.get("replies");
  const key = req.nextUrl.searchParams.get("key") ?? (repliesTo ? `yt:${repliesTo}` : null);
  if (repliesTo !== null || key) {
    const [yt, ours] = await Promise.all([
      repliesTo ? youtubeReplies(repliesTo).catch(() => null) : null,
      key ? listExtComments("comment", key, viewer ? { sub: viewer.sub, isAdmin: viewer.isAdmin } : null).then(filterPosts).catch(() => []) : [],
    ]);
    const list = (yt ?? [])
      .filter((c) => !textBlocked(c.text, ext.rating))
      .map((c) => ({ id: c.id, key: `yt:${c.id}`, name: c.author, picture: ytImage(c.authorPicture), text: c.text, when: c.publishedAt, likes: hide(c.likes), pinned: false, replies: 0 }));
    const d = await decorate(list, ours, sub);
    return NextResponse.json({ replies: d.others, mine: d.mine });
  }
  if ((source !== "jace" && source !== "youtube") || !/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Bad video." }, { status: 400 });

  if (source === "jace") {
    const video = await jaceVideo(id);
    const list = (video?.comments ?? []).filter((c) => !textBlocked(c.body, ext.rating));
    const people = await getProfiles([...new Set(list.map((c) => c.author_id))]).catch(() => new Map());
    const others = [...list]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned))
      .map((c) => ({ id: c.id, key: `jace:${c.id}`, name: c.author_name, picture: people.get(c.author_id)?.picture ?? null, text: c.body, when: c.created_at, likes: 0, pinned: !!c.pinned, replies: 0 }));
    return NextResponse.json(await decorate(others, [], sub));
  }

  const [mine, theirs] = await Promise.all([
    listExtComments("youtube", id, viewer ? { sub: viewer.sub, isAdmin: viewer.isAdmin } : null)
      .then(filterPosts)
      .catch(() => []),
    youtubeComments(id).catch(() => null),
  ]);
  const others = (theirs ?? [])
    .filter((c) => !textBlocked(c.text, ext.rating))
    .map((c) => ({ id: c.id, key: `yt:${c.id}`, name: c.author, picture: ytImage(c.authorPicture), text: c.text, when: c.publishedAt, likes: hide(c.likes), pinned: false, replies: c.replies ?? 0 }));
  return NextResponse.json({ ...(await decorate(others, mine, sub)), youtube: theirs !== null });
}
