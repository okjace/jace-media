"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/components/AppProvider";
import { shrinkImage, shrinkToBlob } from "@/lib/image";
import { uploadPicture } from "@/lib/uploadClient";
import type { Profile } from "@/lib/types";

const input = "w-full rounded-xl border border-line bg-background px-3 py-2 text-[15px] outline-none focus:border-accent";

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { showNotice } = useApp();
  const [name, setName] = useState(profile.customName ? profile.name : "");
  const [bio, setBio] = useState(profile.bio);
  // undefined: unchanged; null: back to the Jace picture; string: a new picture.
  const [picture, setPicture] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const shownPicture = picture === undefined ? profile.picture : picture === null ? profile.jacePicture : picture;
  const usingJacePicture = picture === null || (picture === undefined && !profile.customPicture);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      // On Jace's storage when possible (just its address is saved); otherwise a small copy here.
      const blob = await shrinkToBlob(f, 512, 300 * 1024);
      setPicture(await uploadPicture(blob).catch(() => shrinkImage(f, 400)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that picture.");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || null, bio, ...(picture !== undefined ? { picture } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't save. Try again.");
      return;
    }
    setPicture(undefined);
    showNotice({ kind: "info", text: "Profile saved." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6 rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-center gap-4">
        <Avatar name={name || profile.jaceName} src={shownPicture} size={80} />
        <div className="flex flex-col gap-2">
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" onClick={() => file.current?.click()} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-foreground/[.05]">
            Choose a Jace Media picture
          </button>
          {!usingJacePicture && (
            <button type="button" onClick={() => setPicture(null)} className="text-left text-sm text-muted hover:text-foreground">
              Use my Jace picture
            </button>
          )}
          {usingJacePicture && <span className="text-xs text-muted">Using your Jace picture.</span>}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Handle</span>
        <input value={`@${profile.handle}`} disabled className={`${input} cursor-not-allowed text-muted`} />
        <span className="text-xs text-muted">Your Jace username. Change it on Jace and it changes here too.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Display name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder={profile.jaceName} className={input} />
        <span className="text-xs text-muted">
          {name.trim() ? "Only on Jace Media. " : `Using your Jace name, "${profile.jaceName}". `}
          {name.trim() && (
            <button type="button" onClick={() => setName("")} className="text-accent hover:underline">
              Use my Jace name
            </button>
          )}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Bio</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} className={`${input} resize-y`} />
        <span className="text-right text-xs text-muted">{300 - bio.length}</span>
      </label>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="rounded-full bg-accent px-6 py-2 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
