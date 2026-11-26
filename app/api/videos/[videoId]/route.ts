import { readJson } from "@/lib/auth";
import { deleteVideo, updateVideo } from "@/lib/jace";
import type { Visibility } from "@/lib/types";
import { withJace } from "@/lib/withJace";

const VISIBILITY: Visibility[] = ["public", "unlisted", "private"];

/** Changes your video's title, description, or visibility. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/videos/[videoId]">) {
  const { videoId } = await ctx.params;
  const b = await readJson(req);
  return withJace((token) =>
    updateVideo(token, videoId, {
      title: typeof b.title === "string" ? b.title.slice(0, 140) : undefined,
      description: typeof b.description === "string" ? b.description.slice(0, 5000) : undefined,
      visibility: VISIBILITY.includes(b.visibility as Visibility) ? (b.visibility as Visibility) : undefined,
    }).then((video) => ({ video })),
  );
}

/** Deletes your video from Jace. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/videos/[videoId]">) {
  const { videoId } = await ctx.params;
  return withJace((token) => deleteVideo(token, videoId).then(() => ({ ok: true })));
}
