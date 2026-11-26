import "server-only";
import { createHash, randomBytes } from "crypto";
import type { JaceVideo, JaceVideoDetail, Visibility } from "./types";

/**
 * Server-side client for Jace: "Sign in with Jace" (OAuth 2.0 with PKCE) and
 * Jace's videos API. Nothing here runs in the browser, so the client secret
 * and people's access tokens never leave the server.
 */

export const JACE_URL = (process.env.JACE_URL || "https://jaceo.vercel.app").replace(/\/$/, "");
export const SCOPE = "profile videos";

/** The token is no longer valid (expired or revoked). */
export class JaceUnauthorized extends Error {}
/** The account is banned on Jace. */
export class JaceBanned extends Error {}
/** Jace is unreachable. */
export class JaceUnavailable extends Error {}
/** Jace refused the request with a message worth showing. */
export class JaceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Whether this server has its Jace app credentials yet. */
export function jaceConfigured(): boolean {
  return !!(process.env.JACE_CLIENT_ID && process.env.JACE_CLIENT_SECRET);
}

export function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.JACE_CLIENT_ID;
  const clientSecret = process.env.JACE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("JACE_CLIENT_ID and JACE_CLIENT_SECRET must be set (see README.md).");
  }
  return { clientId, clientSecret };
}

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizeUrl(opts: {
  redirectUri: string;
  state: string;
  challenge: string;
  prompt?: "none" | "select_account";
}): string {
  const url = new URL(`${JACE_URL}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientCredentials().clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
  return url.toString();
}

export async function exchangeCode(code: string, redirectUri: string, verifier: string): Promise<string> {
  const { clientId, clientSecret } = clientCredentials();
  const res = await fetch(`${JACE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!res.ok || !data?.access_token) throw new Error(`Token exchange failed: ${data?.error ?? res.status}`);
  return data.access_token;
}

export type UserInfo = {
  sub: string;
  username: string;
  name: string;
  picture: string | null;
  banned: boolean;
  muted: boolean;
  isAdmin: boolean;
};

/** Calls Jace as a person (a token), or as Jace Media itself (null: client credentials, for public videos). */
async function call(token: string | null, path: string, init?: RequestInit): Promise<unknown> {
  let authorization: string;
  if (token) {
    authorization = `Bearer ${token}`;
  } else {
    const { clientId, clientSecret } = clientCredentials();
    authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }
  let res: Response;
  try {
    res = await fetch(`${JACE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new JaceUnavailable("Couldn't reach Jace.");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = (isJson ? await res.json().catch(() => null) : null) as
    | { error?: string; error_description?: string }
    | null;
  if (res.status === 401 && token) throw new JaceUnauthorized();
  if (res.status === 403 && data?.error === "account_banned") throw new JaceBanned();
  if (res.ok && data !== null) return data;
  if (data?.error && data.error_description && res.status < 500) {
    throw new JaceError(data.error_description, res.status, data.error);
  }
  throw new JaceUnavailable(`Jace answered ${res.status} for ${path}.`);
}

export async function getUserInfo(token: string): Promise<UserInfo> {
  const data = (await call(token, "/api/oauth/userinfo")) as Record<string, unknown>;
  if (!data.sub) throw new JaceUnavailable("userinfo had no sub.");
  const username = String(data.username ?? "jace");
  return {
    sub: String(data.sub),
    username,
    name: typeof data.name === "string" && data.name.trim() ? data.name : username,
    picture: typeof data.picture === "string" ? data.picture : null,
    banned: !!data.banned,
    muted: !!data.muted,
    isAdmin: !!data.is_admin,
  };
}

// ---------- Videos (read only; uploading lives in JaceTube) ----------

export type VideoPage = { videos: JaceVideo[]; nextBefore: string | null };

export async function listVideos(
  token: string | null,
  opts: { q?: string; userId?: string; before?: string; limit?: number } = {},
): Promise<VideoPage> {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.userId) params.set("user_id", opts.userId);
  if (opts.before) params.set("before", opts.before);
  params.set("limit", String(opts.limit ?? 24));
  const body = (await call(token, `/api/oauth/videos?${params}`)) as { videos?: JaceVideo[]; next_before?: string | null };
  if (!Array.isArray(body.videos)) throw new JaceUnavailable("videos response had no list.");
  return { videos: body.videos, nextBefore: body.next_before ?? null };
}

export async function getVideo(token: string | null, id: string): Promise<JaceVideoDetail | null> {
  try {
    const data = (await call(token, `/api/oauth/videos/${encodeURIComponent(id)}`)) as { video?: JaceVideoDetail };
    return data.video ?? null;
  } catch (err) {
    if (err instanceof JaceError && err.status === 404) return null;
    throw err;
  }
}

/** Comments on a Jace video as the signed-in person (they show on JaceTube too). */
export async function addVideoComment(token: string, videoId: string, body: string): Promise<void> {
  await call(token, `/api/oauth/videos/${encodeURIComponent(videoId)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

// ---------- Uploading and managing your own videos ----------

/** Every video the signed-in person owns, in every visibility. */
export async function listMyVideos(token: string, before?: string): Promise<VideoPage> {
  const params = new URLSearchParams({ limit: "100" });
  if (before) params.set("before", before);
  const body = (await call(token, `/api/oauth/videos/mine?${params}`)) as { videos?: JaceVideo[]; next_before?: string | null };
  if (!Array.isArray(body.videos)) throw new JaceUnavailable("videos response had no list.");
  return { videos: body.videos, nextBefore: body.next_before ?? null };
}

export type UploadTicket = { path: string; upload_url: string; method: "PUT"; headers: Record<string, string>; public_url: string };

/** A signed address on Jace's storage; the browser sends the file there itself. */
export async function startUpload(
  token: string,
  file: { kind: "video" | "thumbnail"; filename: string; content_type: string; size: number },
): Promise<UploadTicket> {
  return (await call(token, "/api/oauth/videos/uploads", { method: "POST", body: JSON.stringify(file) })) as UploadTicket;
}

export type NewVideo = { path: string; title: string; description?: string; visibility?: Visibility; thumbnail_path?: string };

/** Publishes an uploaded file as a Jace video. */
export async function createVideo(token: string, video: NewVideo): Promise<{ video: JaceVideoDetail; created: boolean }> {
  return (await call(token, "/api/oauth/videos", { method: "POST", body: JSON.stringify(video) })) as { video: JaceVideoDetail; created: boolean };
}

export async function updateVideo(
  token: string,
  id: string,
  patch: { title?: string; description?: string; visibility?: Visibility },
): Promise<JaceVideoDetail> {
  const data = (await call(token, `/api/oauth/videos/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })) as { video: JaceVideoDetail };
  return data.video;
}

export async function deleteVideo(token: string, id: string): Promise<void> {
  await call(token, `/api/oauth/videos/${encodeURIComponent(id)}`, { method: "DELETE" });
}
