import { readJson } from "@/lib/auth";
import { startUpload } from "@/lib/jace";
import { withJace } from "@/lib/withJace";

/**
 * { kind, filename, content_type, size } → a signed address on Jace's storage.
 * The browser sends the file there itself, so big videos never pass through
 * Jace Media's server.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  return withJace((token) =>
    startUpload(token, {
      kind: body.kind === "thumbnail" ? "thumbnail" : "video",
      filename: String(body.filename ?? "video").slice(0, 200),
      content_type: String(body.content_type ?? ""),
      size: Number(body.size) || 0,
    }),
  );
}
