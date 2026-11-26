import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { redirectUri, safeNext } from "@/lib/auth";
import { authorizeUrl, jaceConfigured, newPkce } from "@/lib/jace";
import { markSilentTried, setStateCookie, type SignInMode } from "@/lib/session";

/**
 * Starts "Sign in with Jace".
 * - mode=silent: prompt=none. Jace signs an already signed-in person straight
 *   back in with no clicks, or answers login_required / consent_required.
 *   A cookie remembers the try, so it never loops.
 * - mode=add: prompt=select_account, so Jace shows its account picker
 *   ("Add another Jace account", or signing an expired account in again).
 * - otherwise: the normal sign-in.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get("mode");
  const mode: SignInMode = raw === "silent" || raw === "add" ? raw : "interactive";
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!jaceConfigured()) {
    return NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}error=setup`, req.url));
  }
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = newPkce();
  const prompt = mode === "silent" ? "none" : mode === "add" ? "select_account" : undefined;
  const res = NextResponse.redirect(authorizeUrl({ redirectUri: redirectUri(req), state, challenge, prompt }));
  setStateCookie(res, { state, verifier, next, mode });
  if (mode === "silent") markSilentTried(res);
  return res;
}
