import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { jaceVideo } from "@/lib/data";
import { listExtComments } from "@/lib/extcomments";
import { getExtensions } from "@/lib/prefs";
import { getProfiles } from "@/lib/profiles";
import { textBlocked } from "@/lib/rating";
import { filterPosts } from "@/lib/ratingfilter";
import { youtubeComments, youtubeReplies, ytImage } from "@/lib/youtube";

/**
 * A video's comments as data, for places that show them in a panel (Shorts).
 * ?source=youtube|jace&id=…
 *   jace:    Jace's own comments
 *   youtube: comments from people on Jace Media (mine) and YouTube's top comments
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const source = req.nextUrl.searchParams.get("source");
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const [viewer, ext] = await Promise.all([getViewer(), getExtensions()]);
  // ?replies=<comment id>: the replies to one YouTube comment.
  const repliesTo = req.nextUrl.searchParams.get("replies");
  if (repliesTo) {
    const list = (await youtubeReplies(repliesTo).catch(() => null)) ?? [];
    return NextResponse.json({
      replies: list
        .filter((c) => !textBlocked(c.text, ext.rating))
        .map((c) => ({ id: c.id, name: c.author, picture: ytImage(c.authorPicture), text: c.text, when: c.publishedAt, likes: ext.hideCounts ? 0 : c.likes })),
    });
  }
  if ((source !== "jace" && source !== "youtube") || !/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ error: "Bad video." }, { status: 400 });

  if (source === "jace") {
    const video = await jaceVideo(id);
    const list = (video?.comments ?? []).filter((c) => !textBlocked(c.body, ext.rating));
    const people = await getProfiles([...new Set(list.map((c) => c.author_id))]).catch(() => new Map());
    return NextResponse.json({
      mine: [],
      others: [...list]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned))
        .map((c) => ({ id: c.id, name: c.author_name, picture: people.get(c.author_id)?.picture ?? null, text: c.body, when: c.created_at, likes: 0, pinned: c.pinned })),
    });
  }

  const [mine, theirs] = await Promise.all([
    listExtComments("youtube", id, viewer ? { sub: viewer.sub, isAdmin: viewer.isAdmin } : null)
      .then(filterPosts)
      .catch(() => []),
    youtubeComments(id).catch(() => null),
  ]);
  return NextResponse.json({
    mine,
    others: (theirs ?? [])
      .filter((c) => !textBlocked(c.text, ext.rating))
      .map((c) => ({ id: c.id, name: c.author, picture: ytImage(c.authorPicture), text: c.text, when: c.publishedAt, likes: ext.hideCounts ? 0 : c.likes, pinned: false, replies: c.replies })),
  });
}
