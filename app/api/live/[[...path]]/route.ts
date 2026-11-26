import { NextResponse, type NextRequest } from "next/server";
import { getViewer, readJson, requireViewer } from "@/lib/auth";
import {
  cfAnswer,
  cfPublish,
  cfSubscribe,
  chat,
  cloudflareAvailable,
  endStream,
  getStream,
  heartbeat,
  iceServers,
  isHost,
  liveNow,
  postSignal,
  readSignals,
  sendChat,
  startStream,
  watching,
} from "@/lib/golive";
import { liveDetails } from "@/lib/youtube";

/**
 * Going live (see lib/golive.ts).
 *
 *   GET   /api/live                     streams live now
 *   POST  /api/live                     go live { title, description }
 *   GET   /api/live/{id}                one stream, plus how to connect
 *   PATCH /api/live/{id}                streamer: { action: "heartbeat" | "end", thumbnail?, title? }
 *   GET   /api/live/{id}/signal         peer-to-peer messages (?host=1&after= or ?peer=&after=)
 *   POST  /api/live/{id}/signal         { peer, kind, payload, toHost }
 *   POST  /api/live/{id}/cf             Cloudflare: streamer { offer, tracks } or viewer {}
 *   PUT   /api/live/{id}/cf             Cloudflare: viewer's answer { sessionId, answer }
 *   POST  /api/live/{id}/watch          viewer check-in { peer, cfBytes }
 *   GET   /api/live/{id}/chat?after=    chat
 *   POST  /api/live/{id}/chat           { body }
 */

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ path?: string[] }> };

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const [id, part] = (await ctx.params).path ?? [];
  const sp = req.nextUrl.searchParams;
  if (!id) return NextResponse.json({ streams: await liveNow() });
  if (!part && id.startsWith("yt-")) {
    // A YouTube live stream's numbers.
    const d = await liveDetails(id.slice(3));
    return NextResponse.json({ viewers: d?.viewers ?? null, startedAt: d?.startedAt ?? null });
  }
  if (!part) {
    const stream = await getStream(id);
    if (!stream) return bad("That stream doesn't exist.", 404);
    const viewer = await getViewer();
    return NextResponse.json({
      stream,
      isHost: !!viewer && viewer.sub === stream.hostSub,
      // Viewers use Cloudflare when the stream is on it and it's still under the free monthly amount.
      useCloudflare: stream.cloudflare && (await cloudflareAvailable()),
      iceServers: await iceServers(),
    });
  }
  if (part === "signal") {
    const after = Number(sp.get("after")) || 0;
    if (sp.get("host")) {
      const viewer = await requireViewer();
      if (viewer instanceof NextResponse) return viewer;
      if (!(await isHost(viewer.sub, id))) return bad("Not your stream.", 403);
      return NextResponse.json({ signals: await readSignals(id, { host: true, after }) });
    }
    const peer = sp.get("peer") ?? "";
    if (!peer) return bad("Missing peer.");
    return NextResponse.json({ signals: await readSignals(id, { host: false, peer, after }) });
  }
  if (part === "chat") return NextResponse.json({ messages: await chat(id, Number(sp.get("after")) || 0) });
  return bad("Not found.", 404);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const [id, part] = (await ctx.params).path ?? [];
  const body = await readJson(req);
  if (!id) {
    const viewer = await requireViewer();
    if (viewer instanceof NextResponse) return viewer;
    const result = await startStream(viewer, String(body.title ?? ""), String(body.description ?? ""));
    if ("error" in result) return bad(result.error);
    return NextResponse.json({ ...result, cloudflare: await cloudflareAvailable(), iceServers: await iceServers() });
  }
  if (part === "signal") {
    const toHost = body.toHost !== false;
    const peer = String(body.peer ?? "");
    const kind = String(body.kind ?? "");
    const payload = String(body.payload ?? "");
    if (!peer || !kind || !payload) return bad("Missing fields.");
    if (!toHost) {
      // Only the streamer answers viewers.
      const viewer = await requireViewer();
      if (viewer instanceof NextResponse) return viewer;
      if (!(await isHost(viewer.sub, id))) return bad("Not your stream.", 403);
    }
    await postSignal(id, peer, toHost, kind, payload);
    return NextResponse.json({ ok: true });
  }
  if (part === "cf") {
    try {
      if (body.offer) {
        const viewer = await requireViewer();
        if (viewer instanceof NextResponse) return viewer;
        if (!(await cloudflareAvailable())) return bad("Cloudflare isn't available right now.", 409);
        const answer = await cfPublish(viewer.sub, id, body.offer as { type: "offer"; sdp: string }, (body.tracks as { mid: string; trackName: string }[]) ?? []);
        return NextResponse.json({ answer });
      }
      if (!(await cloudflareAvailable())) return bad("Cloudflare isn't available right now.", 409);
      return NextResponse.json(await cfSubscribe(id));
    } catch (err) {
      return bad((err as Error).message || "Couldn't connect through Cloudflare.", 502);
    }
  }
  if (part === "watch") {
    const viewer = await getViewer();
    const peer = String(body.peer ?? "");
    if (!peer) return bad("Missing peer.");
    return NextResponse.json(await watching(id, peer, viewer?.sub ?? null, Number(body.cfBytes) || 0));
  }
  if (part === "chat") {
    const viewer = await requireViewer();
    if (viewer instanceof NextResponse) return viewer;
    const result = await sendChat(id, viewer, String(body.body ?? ""));
    if ("error" in result) return bad(result.error);
    return NextResponse.json(result);
  }
  return bad("Not found.", 404);
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const [, part] = (await ctx.params).path ?? [];
  if (part !== "cf") return bad("Not found.", 404);
  const body = await readJson(req);
  try {
    await cfAnswer(String(body.sessionId ?? ""), body.answer as { type: "answer"; sdp: string });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return bad((err as Error).message || "Couldn't connect through Cloudflare.", 502);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const [id] = (await ctx.params).path ?? [];
  if (!id) return bad("Not found.", 404);
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const body = await readJson(req);
  if (body.action === "end") {
    return (await endStream(viewer.sub, id)) ? NextResponse.json({ ok: true }) : bad("Not your stream.", 403);
  }
  const thumbnail = typeof body.thumbnail === "string" && body.thumbnail.length < 200_000 ? body.thumbnail : undefined;
  const ok = await heartbeat(viewer.sub, id, { thumbnail, title: typeof body.title === "string" ? body.title : undefined });
  return ok ? NextResponse.json({ ok: true }) : bad("Not your stream.", 403);
}
