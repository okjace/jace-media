import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { redirectUri, safeNext } from "@/lib/auth";
import { exchangeCode, getUserInfo } from "@/lib/jace";
import { markBanned, syncProfile } from "@/lib/profiles";
import {
  STATE_COOKIE,
  clearSignedOut,
  clearStateCookie,
  markSilentTried,
  parseAccounts,
  ACCOUNTS_COOKIE,
  unseal,
  withAccount,
  writeAccounts,
  type OAuthState,
} from "@/lib/session";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

/** Jace redirects here with ?code&state (or ?error). Exchange the code on the server and remember the account. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const saved = unseal<OAuthState>(req.cookies.get(STATE_COOKIE)?.value);
  const next = safeNext(saved?.next);
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url));
    clearStateCookie(res);
    return res;
  };

  const error = params.get("error");
  if (error) {
    // A silent try that Jace couldn't complete (not signed in to Jace, or
    // automatic sign-in switched off): no error, just show "Sign in with Jace".
    if (saved?.mode === "silent" || ["login_required", "consent_required", "interaction_required"].includes(error)) {
      const res = go(saved?.mode === "silent" ? next : withParam(next, "error", "signin"));
      markSilentTried(res);
      return res;
    }
    return go(withParam(next, "error", error === "access_denied" ? "denied" : "signin"));
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || !saved || !sameState(state, saved.state)) return go(withParam(next, "error", "state"));

  try {
    const token = await exchangeCode(code, redirectUri(req), saved.verifier);
    const info = await getUserInfo(token);
    if (info.banned) {
      await markBanned(info.sub).catch(() => {});
      return go(withParam(next, "error", "banned"));
    }
    await syncProfile(info);
    const accounts = parseAccounts(req.cookies.get(ACCOUNTS_COOKIE)?.value);
    const added = !accounts.accounts.some((a) => a.sub === info.sub) && accounts.accounts.length > 0;
    const res = go(withParam(next, added ? "added" : "signedin", info.username));
    writeAccounts(res, withAccount(accounts, { sub: info.sub, token, iat: Date.now() }));
    clearSignedOut(res);
    return res;
  } catch (err) {
    console.error("Sign in with Jace failed:", err);
    return go(withParam(next, "error", "signin"));
  }
}
