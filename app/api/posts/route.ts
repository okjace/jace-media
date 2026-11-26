import { NextResponse } from "next/server";
import { readJson, requireViewer } from "@/lib/auth";
import { getVideo } from "@/lib/jace";
import { createPost } from "@/lib/posts";
import { resolvePost } from "@/lib/resolvePost";
import { getCurrent } from "@/lib/session";
import type { PostVideo } from "@/lib/types";
import { parseYouTubeVideo, VIDEO_ID } from "@/lib/youtube";

/** A Jace video's link anywhere in the text (Jace Media or JaceTube watch pages). */
const JACE_LINK = /https?:\/\/[^\s]*\/watch\/jace\/([A-Za-z0-9_-]{6,64})/;

/** The video for a post: the one uploaded with it, or the first YouTube or Jace video linked in it. */
async function postVideo(ref: unknown, body: string): Promise<PostVideo | null> {
  let source: "youtube" | "jace" | null = null;
  let id: string | null = null;
  if (ref && typeof ref === "object") {
    const r = ref as Record<string, unknown>;
    if ((r.source === "jace" || r.source === "youtube") && typeof r.id === "string") {
      source = r.source;
      id = r.id;
    }
  }
  if (!source) {
    const yt = body.match(/https?:\/\/[^\s]+/g)?.map((u) => parseYouTubeVideo(u)).find(Boolean);
    if (yt) [source, id] = ["youtube", yt];
    else {
      const jace = body.match(JACE_LINK)?.[1];
      if (jace) [source, id] = ["jace", jace];
    }
  }
  if (!source || !id) return null;
  if (source === "youtube") return VIDEO_ID.test(id) ? { source, id, thumbnail: `/api/yt-thumb/${id}` } : null;
  // Jace: look it up as the poster, so only videos they can see can be attached.
  const current = await getCurrent();
  const video = await getVideo(current?.token ?? null, id).catch(() => null);
  return video ? { source, id, title: video.title, thumbnail: video.thumbnail_url, src: video.url } : null;
}

/**
 * Posts on Jace Media: { body, parentId?, image? (legacy data: URL), imageUrl? (on Jace's storage),
 * video?: { source, id }, quote?: { network, id }, poll?: { options, days } }. A quote with no body is a repost.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  const text = typeof body.body === "string" ? body.body : "";

  let quote = null;
  if (body.quote && typeof body.quote === "object") {
    const ref = body.quote as Record<string, unknown>;
    quote = await resolvePost(ref.network, ref.id, viewer);
    if (!quote) return NextResponse.json({ error: "That post can't be found anymore." }, { status: 404 });
  }
  const pollIn = body.poll && typeof body.poll === "object" ? (body.poll as Record<string, unknown>) : null;
  const poll = pollIn && Array.isArray(pollIn.options) ? { options: pollIn.options.filter((o): o is string => typeof o === "string"), days: Number(pollIn.days) || 1 } : null;
  const video = body.parentId ? null : await postVideo(body.video, text);

  const result = await createPost(viewer, {
    body: text,
    parentId: typeof body.parentId === "string" ? body.parentId : null,
    image: typeof body.image === "string" ? body.image : null,
    imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
    video,
    quote,
    poll,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
