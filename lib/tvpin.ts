import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { q } from "./db";

/** TV profile lock: a 4-digit PIN per profile, kept as a salted scrypt hash. */

const valid = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin);

function hash(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("base64")}:${scryptSync(pin, salt, 32).toString("base64")}`;
}

function matches(pin: string, stored: string): boolean {
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const a = scryptSync(pin, Buffer.from(salt, "base64"), 32);
  const b = Buffer.from(h, "base64");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function pinnedAmong(subs: string[]): Promise<Set<string>> {
  if (!subs.length) return new Set();
  const rows = await q(`SELECT sub FROM profiles WHERE sub = ANY($1::text[]) AND tv_pin IS NOT NULL`, [subs]);
  return new Set(rows.map((r) => r.sub as string));
}

/** Checks a PIN. After 5 wrong tries, a wait that grows each time. */
export async function checkPin(sub: string, pin: unknown): Promise<{ ok: true } | { ok: false; error: string; wait?: number }> {
  const rows = await q(`SELECT tv_pin, tv_pin_fails, tv_pin_until FROM profiles WHERE sub = $1`, [sub]);
  const r = rows[0];
  if (!r?.tv_pin) return { ok: true };
  const until = Number(r.tv_pin_until);
  if (until > Date.now()) return { ok: false, error: "Too many tries. Wait a moment.", wait: Math.ceil((until - Date.now()) / 1000) };
  if (valid(pin) && matches(pin, r.tv_pin as string)) {
    await q(`UPDATE profiles SET tv_pin_fails = 0, tv_pin_until = 0 WHERE sub = $1`, [sub]);
    return { ok: true };
  }
  const fails = Number(r.tv_pin_fails) + 1;
  const wait = fails >= 5 ? Math.min(3600, 30 * 2 ** (fails - 5)) : 0;
  await q(`UPDATE profiles SET tv_pin_fails = $2, tv_pin_until = $3 WHERE sub = $1`, [sub, fails, wait ? Date.now() + wait * 1000 : 0]);
  return wait ? { ok: false, error: `Wrong PIN. Try again in ${wait} seconds.`, wait } : { ok: false, error: "Wrong PIN." };
}

/** Sets, changes, or removes (pin null) your PIN. Changing or removing needs the current one. */
export async function setPin(sub: string, pin: unknown, currentPin: unknown): Promise<{ ok: true } | { error: string }> {
  const check = await checkPin(sub, currentPin);
  if (!check.ok) return { error: check.error };
  if (pin === null) {
    await q(`UPDATE profiles SET tv_pin = NULL, tv_pin_fails = 0, tv_pin_until = 0 WHERE sub = $1`, [sub]);
    return { ok: true };
  }
  if (!valid(pin)) return { error: "A PIN is 4 numbers." };
  await q(`UPDATE profiles SET tv_pin = $2, tv_pin_fails = 0, tv_pin_until = 0 WHERE sub = $1`, [sub, hash(pin)]);
  return { ok: true };
}
