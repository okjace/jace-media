import { readJson } from "@/lib/auth";
import { createVideo } from "@/lib/jace";
import type { Visibility } from "@/lib/types";
import { withJace } from "@/lib/withJace";

const VISIBILITY: Visibility[] = ["public", "unlisted", "private"];

/** Publishes an uploaded file as a Jace video: { path, title, description?, visibility?, thumbnail_path? }. */
export async function POST(req: Request) {
  const b = await readJson(req);
  return withJace((token) =>
    createVideo(token, {
      path: String(b.path ?? ""),
      title: String(b.title ?? "").slice(0, 140),
      description: typeof b.description === "string" ? b.description.slice(0, 5000) : undefined,
      visibility: VISIBILITY.includes(b.visibility as Visibility) ? (b.visibility as Visibility) : "public",
      thumbnail_path: typeof b.thumbnail_path === "string" && b.thumbnail_path ? b.thumbnail_path : undefined,
    }),
  );
}
