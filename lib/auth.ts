import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getProfile, getProfiles, summary } from "./profiles";
import { getAccounts, getCurrent } from "./session";
import type { AccountSummary, Profile } from "./types";

/** Where Jace sends people back to after signing in. Must be registered in Jace exactly. */
export function redirectUri(req: NextRequest): string {
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");
  return `${base}/api/auth/callback`;
}

/** Only same-site paths, so `next` can't be used as an open redirect. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/api/")) return "/";
  return value;
}

/** The signed-in person's Jace Media profile, or null. */
export async function getViewer(): Promise<Profile | null> {
  const current = await getCurrent();
  if (!current) return null;
  try {
    return await getProfile(current.sub);
  } catch (err) {
    console.error("Couldn't read the profile:", err);
    return null;
  }
}

/** The account menu: the current account first, then the others. */
export async function getAccountList(): Promise<{ current: AccountSummary | null; others: AccountSummary[] }> {
  const { current, accounts } = await getAccounts();
  if (accounts.length === 0) return { current: null, others: [] };
  let profiles: Map<string, Profile>;
  try {
    profiles = await getProfiles(accounts.map((a) => a.sub));
  } catch (err) {
    console.error("Couldn't read profiles:", err);
    profiles = new Map();
  }
  const list = accounts.map(
    (a): AccountSummary => {
      const p = profiles.get(a.sub);
      return p ? summary(p) : { sub: a.sub, handle: "jace", name: "Jace account", picture: null };
    },
  );
  return { current: list.find((a) => a.sub === current) ?? null, others: list.filter((a) => a.sub !== current) };
}

export async function requireViewer(): Promise<Profile | NextResponse> {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in with Jace first." }, { status: 401 });
  return viewer;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
