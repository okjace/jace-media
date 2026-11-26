import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { randomInt } from "crypto";
import { readJson } from "@/lib/auth";
import { q } from "@/lib/db";
import { getAccounts, getCurrent, parseAccounts, seal, withAccount, writeAccounts, type StoredAccount } from "@/lib/session";

/**
 * Signing in on a TV without typing a password:
 * 1. The TV asks for a code (POST) and shows it with a QR code.
 * 2. You scan it with your phone, which opens /tv/link?code=… on Jace Media,
 *    where you're signed in, and confirm (PUT).
 * 3. The TV keeps checking (GET) and, once confirmed, is signed in too.
 * Codes last 10 minutes and work once.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL = 10 * 60_000;

function newCode(): string {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** { purpose?: "signin" | "unlock", sub? } — unlock: approve on your phone instead of typing the PIN. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await readJson(req);
  const purpose = body.purpose === "unlock" ? "unlock" : "signin";
  const forSub = purpose === "unlock" && typeof body.sub === "string" ? body.sub : null;
  if (purpose === "unlock" && !(await getAccounts()).accounts.some((a) => a.sub === forSub)) {
    return NextResponse.json({ error: "That profile isn't on this TV." }, { status: 404 });
  }
  await q(`DELETE FROM tv_links WHERE created_at < $1`, [Date.now() - TTL]);
  const code = newCode();
  await q(`INSERT INTO tv_links (code, created_at, purpose, sub) VALUES ($1, $2, $3, $4)`, [code, Date.now(), purpose, forSub]);
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");
  const url = `${base}/tv/link?code=${code}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111317", light: "#ffffff" } });
  return NextResponse.json({ code, url, qr, expiresIn: TTL / 1000 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = (req.nextUrl.searchParams.get("code") ?? "").toUpperCase();
  const rows = await q(`SELECT sealed, created_at, purpose, sub FROM tv_links WHERE code = $1`, [code]);
  const row = rows[0];
  if (!row || Date.now() - Number(row.created_at) > TTL) return NextResponse.json({ expired: true });
  if (!row.sealed) return NextResponse.json({ done: false });
  await q(`DELETE FROM tv_links WHERE code = $1`, [code]);
  // Unlocking: the phone approved, so the TV opens that profile without the PIN.
  if (row.purpose === "unlock") return NextResponse.json({ done: true, unlocked: row.sub });
  const linked = parseAccounts(row.sealed as string).accounts[0];
  const res = NextResponse.json({ done: true });
  if (linked) writeAccounts(res, withAccount(await getAccounts(), linked));
  return res;
}

/** From the phone: sign the TV in with the account you're using. { code } */
export async function PUT(req: Request): Promise<NextResponse> {
  const current = await getCurrent();
  if (!current) return NextResponse.json({ error: "Sign in with Jace first." }, { status: 401 });
  const { code } = await readJson(req);
  const c = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const account: StoredAccount = current;
  const link = (await q(`SELECT purpose, sub FROM tv_links WHERE code = $1`, [c]))[0];
  if (link?.purpose === "unlock" && link.sub !== current.sub) {
    return NextResponse.json({ error: "That TV is asking for a different profile. Switch to it here first." }, { status: 403 });
  }
  const done = await q(`UPDATE tv_links SET sealed = $2 WHERE code = $1 AND sealed IS NULL AND created_at > $3 RETURNING code`, [
    c,
    seal({ current: account.sub, accounts: [account] }),
    Date.now() - TTL,
  ]);
  if (!done.length) return NextResponse.json({ error: "That code didn't work. It may have expired; get a new one on your TV." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
