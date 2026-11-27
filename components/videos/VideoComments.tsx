import { CommentList } from "@/components/videos/CommentList";
import type { JaceVideoDetail } from "@/lib/types";

/**
 * Comments under a video. Jace videos: Jace's own comments (and yours go to Jace).
 * YouTube videos: comments from people on Jace Media, plus YouTube's own.
 * Every comment can be liked and replied to; replies open under it.
 */
export function VideoComments({ source, id }: { source: "youtube" | "jace"; id: string; jace?: JaceVideoDetail }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Comments</h2>
      <CommentList source={source} id={id} />
    </section>
  );
}
