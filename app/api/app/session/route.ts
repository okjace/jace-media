import { NextResponse, type NextRequest } from "next/server";
import { readJson } from "@/lib/auth";
import { JaceBanned, JaceUnauthorized, JaceUnavailable, getUserInfo } from "@/lib/jace";
import { markBanned, syncProfile } from "@/lib/profiles";
import { ACCOUNTS_COOKIE, APP_SESSION_HEADER, MAX_ACCOUNTS, parseAccounts, seal, withoutAccount, type Accounts } from "@/lib/session";

/**
 * Accounts on a phone app. The app keeps its (encrypted) session itself, so every
 * answer carries the new session to keep, or null when no account is left.
 *   { action: "switch", sub }         use another account on this phone
 *   { action: "remove", sub }         sign one account out of this phone
 *   { action: "merge", other }        after "Add account": keep both sessions' accounts, the new one in use
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = req.headers.get(APP_SESSION_HEADER) ?? req.cookies.get(ACCOUNTS_COOKIE)?.value;
  let accounts = parseAccounts(raw ?? undefined);
  const body = await readJson(req);
  const out = (value: Accounts, extra: Record<string, unknown> = {}, status = 200) =>
    NextResponse.json({ session: value.accounts.length ? seal(value) : null, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

  if (body.action === "merge" && typeof body.other === "string") {
    const other = parseAccounts(body.other);
    const subs = new Set(other.accounts.map((a) => a.sub));
    accounts = {
      current: other.current ?? accounts.current,
      accounts: [...other.accounts, ...accounts.accounts.filter((a) => !subs.has(a.sub))].slice(0, MAX_ACCOUNTS),
    };
    return out(accounts);
  }

  const account = accounts.accounts.find((a) => a.sub === body.sub);
  if (!account) return NextResponse.json({ error: "That account isn't on this device anymore." }, { status: 404 });

  if (body.action === "remove") return out(withoutAccount(accounts, account.sub));

  if (body.action === "switch") {
    try {
      const info = await getUserInfo(account.token);
      if (info.banned) throw new JaceBanned();
      await syncProfile(info);
    } catch (err) {
      if (err instanceof JaceUnauthorized) return out(withoutAccount(accounts, account.sub), { reauth: true });
      if (err instanceof JaceBanned) {
        await markBanned(account.sub).catch(() => {});
        return out(withoutAccount(accounts, account.sub), { banned: true }, 403);
      }
      if (!(err instanceof JaceUnavailable)) throw err;
    }
    return out({ ...accounts, current: account.sub });
  }
  return NextResponse.json({ error: "Bad request." }, { status: 400 });
}
