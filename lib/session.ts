import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { jaceConfigured } from "./jace";

/**
 * Every Jace account that signed in to Jace Media on this device, in one
 * encrypted, HTTP-only cookie (AES-256-GCM, key from SESSION_SECRET). The
 * browser can't read the tokens or forge the list, and there's no session
 * store to run. Names and pictures live in the database (lib/profiles.ts),
 * so the cookie stays small enough for many accounts.
 */

export const ACCOUNTS_COOKIE = "jm_accounts";
export const STATE_COOKIE = "jm_oauth_state";
/** Set when a silent sign-in was tried, so a "login_required" answer never loops. */
export const SILENT_COOKIE = "jm_silent_tried";
/** Set when someone signs out on purpose: no automatic sign-in until they sign in again themselves. */
export const SIGNED_OUT_COOKIE = "jm_signed_out";

export const MAX_ACCOUNTS = 10;
// Jace access tokens last 365 days; keep the cookie a little shorter.
const MAX_AGE = 60 * 60 * 24 * 360;

export type StoredAccount = { sub: string; token: string; iat: number };
export type Accounts = { current: string | null; accounts: StoredAccount[] };

export type SignInMode = "silent" | "interactive" | "add";
export type OAuthState = { state: string; verifier: string; next: string; mode: SignInMode };

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters (see README.md).");
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function clean(value: Accounts | null): Accounts {
  const accounts = (value?.accounts ?? []).filter((a) => a && typeof a.sub === "string" && typeof a.token === "string");
  const current = accounts.some((a) => a.sub === value?.current) ? value!.current : (accounts[0]?.sub ?? null);
  return { current, accounts };
}

export function parseAccounts(raw: string | undefined): Accounts {
  return clean(unseal<Accounts>(raw));
}

/** Every remembered account and which one is in use. For server components and route handlers. */
export async function getAccounts(): Promise<Accounts> {
  return parseAccounts((await cookies()).get(ACCOUNTS_COOKIE)?.value);
}

/** The account in use, with its token, or null. */
export async function getCurrent(): Promise<StoredAccount | null> {
  const { current, accounts } = await getAccounts();
  return accounts.find((a) => a.sub === current) ?? null;
}

export function writeAccounts(res: NextResponse, value: Accounts): void {
  const next = clean(value);
  if (next.accounts.length === 0) {
    res.cookies.set(ACCOUNTS_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return;
  }
  res.cookies.set(ACCOUNTS_COOKIE, seal(next), { ...cookieOptions, maxAge: MAX_AGE });
}

/** Adds (or refreshes) an account and makes it the current one. */
export function withAccount(value: Accounts, account: StoredAccount): Accounts {
  const others = value.accounts.filter((a) => a.sub !== account.sub);
  return { current: account.sub, accounts: [account, ...others].slice(0, MAX_ACCOUNTS) };
}

export function withoutAccount(value: Accounts, sub: string): Accounts {
  const accounts = value.accounts.filter((a) => a.sub !== sub);
  return { current: value.current === sub ? (accounts[0]?.sub ?? null) : value.current, accounts };
}

export function setStateCookie(res: NextResponse, value: OAuthState): void {
  res.cookies.set(STATE_COOKIE, seal(value), { ...cookieOptions, maxAge: 10 * 60 });
}

export function clearStateCookie(res: NextResponse): void {
  res.cookies.set(STATE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export function markSilentTried(res: NextResponse): void {
  res.cookies.set(SILENT_COOKIE, "1", { ...cookieOptions, maxAge: 10 * 60 });
}

export function markSignedOut(res: NextResponse): void {
  res.cookies.set(SIGNED_OUT_COOKIE, "1", { ...cookieOptions, maxAge: MAX_AGE });
}

export function clearSignedOut(res: NextResponse): void {
  res.cookies.set(SIGNED_OUT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

/** Whether opening the app should try signing in with Jace silently. */
export async function shouldAutoSignIn(): Promise<boolean> {
  if (!jaceConfigured()) return false;
  const store = await cookies();
  if (parseAccounts(store.get(ACCOUNTS_COOKIE)?.value).accounts.length > 0) return false;
  return !store.get(SILENT_COOKIE)?.value && !store.get(SIGNED_OUT_COOKIE)?.value;
}
