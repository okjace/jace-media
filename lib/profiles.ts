import "server-only";
import { randomUUID } from "crypto";
import { q } from "./db";
import type { UserInfo } from "./jace";
import type { AccountSummary, Profile } from "./types";

/**
 * Jace Media profiles. The handle is always the person's Jace username. The
 * name and picture start as their Jace ones and follow Jace, until the person
 * picks a different name or picture just for Jace Media.
 */

export const MAX_NAME = 50;
export const MAX_BIO = 300;
export const MAX_AVATAR_BYTES = 400 * 1024;

type Row = Record<string, unknown>;

export function toProfile(r: Row): Profile {
  const custom = typeof r.display_name === "string" && r.display_name.trim() !== "";
  const avatarId = typeof r.avatar_id === "string" ? r.avatar_id : null;
  const avatarUrl = typeof r.avatar_url === "string" && r.avatar_url ? r.avatar_url : null;
  const jacePicture = (r.jace_picture as string | null) ?? null;
  return {
    sub: r.sub as string,
    handle: r.handle as string,
    name: custom ? (r.display_name as string) : (r.jace_name as string),
    picture: avatarUrl ?? (avatarId ? `/api/images/${avatarId}` : jacePicture),
    bio: (r.bio as string) ?? "",
    jaceName: r.jace_name as string,
    jacePicture,
    customName: custom,
    customPicture: !!avatarUrl || !!avatarId,
    isAdmin: !!r.is_admin,
    muted: !!r.muted,
  };
}

export function summary(p: Profile): AccountSummary {
  return { sub: p.sub, handle: p.handle, name: p.name, picture: p.picture };
}

/** Creates or refreshes a profile from Jace's userinfo. Never touches the Jace Media name or picture. */
export async function syncProfile(info: UserInfo): Promise<Profile> {
  const now = Date.now();
  const rows = await q(
    `INSERT INTO profiles (sub, handle, jace_name, jace_picture, is_admin, muted, banned, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     ON CONFLICT (sub) DO UPDATE SET handle = EXCLUDED.handle, jace_name = EXCLUDED.jace_name,
       jace_picture = EXCLUDED.jace_picture, is_admin = EXCLUDED.is_admin, muted = EXCLUDED.muted,
       banned = EXCLUDED.banned, updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [info.sub, info.username, info.name, info.picture, info.isAdmin, info.muted, info.banned, now],
  );
  return toProfile(rows[0]);
}

export async function markBanned(sub: string): Promise<void> {
  await q(`UPDATE profiles SET banned = TRUE, updated_at = $2 WHERE sub = $1`, [sub, Date.now()]);
}

export async function getProfile(sub: string): Promise<Profile | null> {
  const rows = await q(`SELECT * FROM profiles WHERE sub = $1`, [sub]);
  return rows[0] ? toProfile(rows[0]) : null;
}

export async function getProfileByHandle(handle: string): Promise<(Profile & { banned: boolean }) | null> {
  const rows = await q(`SELECT * FROM profiles WHERE lower(handle) = lower($1) ORDER BY updated_at DESC LIMIT 1`, [handle]);
  return rows[0] ? { ...toProfile(rows[0]), banned: !!rows[0].banned } : null;
}

export async function getProfiles(subs: string[]): Promise<Map<string, Profile>> {
  if (subs.length === 0) return new Map();
  const rows = await q(`SELECT * FROM profiles WHERE sub = ANY($1::text[])`, [subs]);
  return new Map(rows.map((r) => [r.sub as string, toProfile(r)]));
}

export type ProfilePatch = {
  name?: string | null;
  bio?: string;
  /** A data: URL for a new picture, or null to go back to the Jace picture. */
  picture?: string | null;
};

export async function updateProfile(sub: string, patch: ProfilePatch): Promise<Profile | { error: string }> {
  const current = await getProfile(sub);
  if (!current) return { error: "Sign in again." };

  if (patch.name !== undefined) {
    const name = (patch.name ?? "").replace(/\s+/g, " ").trim();
    if (name.length > MAX_NAME) return { error: `Names can be up to ${MAX_NAME} characters.` };
    // An empty name, or the Jace name itself, means "use my Jace name".
    const value = name === "" || name === current.jaceName ? null : name;
    await q(`UPDATE profiles SET display_name = $2, updated_at = $3 WHERE sub = $1`, [sub, value, Date.now()]);
  }
  if (patch.bio !== undefined) {
    const bio = patch.bio.trim();
    if (bio.length > MAX_BIO) return { error: `Bios can be up to ${MAX_BIO} characters.` };
    await q(`UPDATE profiles SET bio = $2, updated_at = $3 WHERE sub = $1`, [sub, bio, Date.now()]);
  }
  if (patch.picture !== undefined && patch.picture && /^https?:\/\//.test(patch.picture)) {
    // A picture already uploaded to your folder on Jace's storage.
    const { isOwnJaceUpload } = await import("./jaceStorage");
    if (!isOwnJaceUpload(patch.picture, sub)) return { error: "That picture can't be used." };
    const old = await q(`SELECT avatar_id FROM profiles WHERE sub = $1`, [sub]);
    await q(`UPDATE profiles SET avatar_url = $2, avatar_id = NULL, updated_at = $3 WHERE sub = $1`, [sub, patch.picture, Date.now()]);
    const oldId = old[0]?.avatar_id as string | null;
    if (oldId) await q(`DELETE FROM images WHERE id = $1`, [oldId]);
  } else if (patch.picture !== undefined) {
    let avatarId: string | null = null;
    if (patch.picture) {
      const saved = await saveImage(sub, patch.picture);
      if ("error" in saved) return saved;
      avatarId = saved.id;
    }
    const old = await q(`SELECT avatar_id FROM profiles WHERE sub = $1`, [sub]);
    await q(`UPDATE profiles SET avatar_id = $2, avatar_url = NULL, updated_at = $3 WHERE sub = $1`, [sub, avatarId, Date.now()]);
    const oldId = old[0]?.avatar_id as string | null;
    if (oldId && oldId !== avatarId) await q(`DELETE FROM images WHERE id = $1`, [oldId]);
  }
  return (await getProfile(sub))!;
}

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

export async function saveImage(sub: string, dataUrl: string): Promise<{ id: string } | { error: string }> {
  const match = dataUrl.match(DATA_URL);
  if (!match) return { error: "Pictures must be PNG, JPEG, WebP, or GIF." };
  if ((match[2].length * 3) / 4 > MAX_AVATAR_BYTES) return { error: "That picture is too big. Try a smaller one." };
  const id = randomUUID();
  await q(`INSERT INTO images (id, owner_sub, mime, data, created_at) VALUES ($1, $2, $3, $4, $5)`, [
    id,
    sub,
    match[1],
    match[2],
    Date.now(),
  ]);
  return { id };
}

export async function getImage(id: string): Promise<{ mime: string; data: Buffer } | null> {
  const rows = await q(`SELECT mime, data FROM images WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  return { mime: rows[0].mime as string, data: Buffer.from(rows[0].data as string, "base64") };
}

/** People on Jace Media whose handle or name matches a search. */
export async function searchProfiles(term: string, limit = 12): Promise<Profile[]> {
  const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await q(
    `SELECT * FROM profiles WHERE banned = FALSE AND (handle ILIKE $1 OR display_name ILIKE $1 OR jace_name ILIKE $1)
     ORDER BY (lower(handle) = lower($2)) DESC, updated_at DESC LIMIT $3`,
    [like, term, limit],
  );
  return rows.map(toProfile);
}
