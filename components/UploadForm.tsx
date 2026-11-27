"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { VideoEditor, type EditorControls } from "@/components/upload/VideoEditor";
import { bytes } from "@/lib/format";
import { captureThumbnail, publishVideo } from "@/lib/uploadClient";
import { defaultEdits, isUnedited, outputDuration, renderEdited, stamp, type Edits } from "@/lib/videoEdit";
import type { Visibility } from "@/lib/types";

const VISIBILITY: { id: Visibility; label: string; hint: string }[] = [
  { id: "public", label: "Public", hint: "Anyone can find and watch it." },
  { id: "unlisted", label: "Unlisted", hint: "Only people with the link can watch it." },
  { id: "private", label: "Private", hint: "Only you can watch it." },
];
const DRAFT_KEY = "jm_upload_draft";
const MAX_SIZE = 5 * 1024 ** 3;

export const fieldClass =
  "w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent";

type Info = { duration: number; width: number; height: number };

function readInfo(url: string): Promise<Info | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => resolve(null);
    v.src = url;
  });
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 140);
}

function tagsToText(tags: string): string {
  return tags
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter(Boolean)
    .slice(0, 15)
    .map((t) => `#${t}`)
    .join(" ");
}

function Thumb({ blob, on, onClick, label }: { blob: Blob; on: boolean; onClick: () => void; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`aspect-video overflow-hidden rounded-lg border-2 bg-black ${on ? "border-accent" : "border-transparent opacity-80 hover:opacity-100"}`}
    >
      {/* A local picture, so a plain <img>. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [short, setShort] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("short"));
  const [thumbs, setThumbs] = useState<Blob[]>([]);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [phase, setPhase] = useState<null | "rendering" | "uploading">(null);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const descBox = useRef<HTMLTextAreaElement>(null);
  const controls = useRef<EditorControls | null>(null);
  const started = useRef(0);

  // Remix: credit the Short you're remixing (from Shorts → Remix).
  const [remix, setRemix] = useState<{ ref: string; title: string; channel: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ref = p.get("remix");
    if (!ref || !/^(youtube|jace):[\w-]{1,64}$/.test(ref)) return;
    const r = { ref, title: p.get("rtitle") ?? "a Short", channel: p.get("rchannel") ?? "" };
    /* eslint-disable react-hooks/set-state-in-effect */
    setRemix(r);
    setShort(true);
    setTitle((t) => t || `Remix: ${r.title}`.slice(0, 140));
    setDescription((d) => d || `Remix of "${r.title}"${r.channel ? ` by ${r.channel}` : ""}\n${window.location.origin}/shorts?v=${r.ref}`);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Pick up where you left off (the words, not the file).
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as { title?: string; description?: string; tags?: string; visibility?: Visibility } | null;
      if (!d) return;
      /* eslint-disable react-hooks/set-state-in-effect */
      if (d.title) setTitle(d.title);
      if (d.description) setDescription(d.description);
      if (d.tags) setTags(d.tags);
      if (d.visibility) setVisibility(d.visibility);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {}
  }, []);
  useEffect(() => {
    if (!title && !description && !tags) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, tags, visibility }));
      setDraftSaved(true);
    }, 600);
    return () => clearTimeout(t);
  }, [title, description, tags, visibility]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  // Don't lose an upload by closing the tab.
  useEffect(() => {
    if (!phase) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  async function choose(next: File | undefined) {
    if (!next) return;
    if (!next.type.startsWith("video/")) return setError("That isn't a video file.");
    if (next.size > MAX_SIZE) return setError(`That video is ${bytes(next.size)}. Jace takes videos up to 5 GB.`);
    setError(null);
    const objectUrl = URL.createObjectURL(next);
    const meta = await readInfo(objectUrl);
    setFile(next);
    setUrl(objectUrl);
    setInfo(meta);
    setEdits(meta ? defaultEdits(meta.duration) : null);
    if (!title) setTitle(titleFromName(next.name));
    if (meta && meta.height > meta.width) setShort(true);
    setThumbs([]);
    setThumbnail(null);
    // Three suggested thumbnails from across the video.
    const picks: Blob[] = [];
    for (const at of meta ? [0.2, 0.5, 0.8].map((f) => f * meta.duration) : [1]) {
      const b = await captureThumbnail(next, at);
      if (b) {
        picks.push(b);
        setThumbs([...picks]);
        if (picks.length === 1) setThumbnail(b);
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void choose(e.dataTransfer.files[0]);
  }

  const addThumb = useCallback((blob: Blob) => {
    setThumbs((list) => [blob, ...list].slice(0, 8));
    setThumbnail(blob);
  }, []);

  function addChapter() {
    const at = stamp(controls.current?.outputTime() ?? 0);
    const box = descBox.current;
    const line = `${at} `;
    let next = description;
    // YouTube-style chapters start at 0:00.
    if (!/^0:00\b/m.test(next) && at !== "0:00") next = `${next.trimEnd()}${next.trim() ? "\n\n" : ""}0:00 Intro`;
    next = `${next.trimEnd()}${next.trim() ? "\n" : ""}${line}`;
    setDescription(next.slice(0, 5000));
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    });
  }

  const edited = !!edits && !!info && !isUnedited(edits, info.duration);

  async function finalFile(signal: AbortSignal): Promise<File> {
    if (!file) throw new Error("Choose a video first.");
    if (!edited || !edits) return file;
    setPhase("rendering");
    setProgress(0);
    started.current = Date.now();
    return renderEdited(file, edits, (f) => {
      setProgress(f);
      const spent = (Date.now() - started.current) / 1000;
      setEta(f > 0.03 ? `${stamp((spent / f) * (1 - f))} left` : null);
    }, signal);
  }

  async function saveCopy() {
    if (!file) return;
    setError(null);
    abort.current = new AbortController();
    try {
      const out = await finalFile(abort.current.signal);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = out.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message || "Couldn't save the video.");
    } finally {
      setPhase(null);
      setEta(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setError(null);
    abort.current = new AbortController();
    const signal = abort.current.signal;
    try {
      const upload = await finalFile(signal);
      if (upload.size > MAX_SIZE) throw new Error(`The edited video is ${bytes(upload.size)}. Pick a lower quality under Quality.`);
      setPhase("uploading");
      setProgress(0);
      started.current = Date.now();
      const hashtags = tagsToText(tags);
      let desc = description.trim();
      if (hashtags) desc = `${desc}\n\n${hashtags}`.trim();
      // Jace marks Shorts with #shorts.
      if (short && !/#shorts?\b/i.test(`${title} ${desc}`)) desc = `${desc}\n\n#shorts`.trim();
      const { video } = await publishVideo(
        { file: upload, thumbnail, title: title.trim(), description: desc, visibility },
        (f) => {
          setProgress(f);
          const spent = (Date.now() - started.current) / 1000;
          if (f > 0.02) setEta(`${bytes((upload.size * f) / spent)}/s · ${stamp((spent / f) * (1 - f))} left`);
        },
        signal,
      );
      localStorage.removeItem(DRAFT_KEY);
      router.push(short ? `/shorts?v=jace:${video.id}` : `/watch/jace/${video.id}`);
    } catch (err) {
      setPhase(null);
      setEta(null);
      if ((err as Error).name !== "AbortError") setError((err as Error).message || "Upload failed.");
    }
  }

  const busy = phase !== null;
  const out = edits ? outputDuration(edits) : 0;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {remix && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/[.07] px-4 py-3 text-sm">
          <span className="text-xl" aria-hidden="true">🔁</span>
          <span className="min-w-0 flex-1">
            Remixing <b>{remix.title}</b>
            {remix.channel && <> by {remix.channel}</>}. The original is credited and linked in your description.
          </span>
          <a href={`/shorts?v=${remix.ref}`} className="shrink-0 text-accent hover:underline">
            Watch original
          </a>
        </div>
      )}

      {!file || !url ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? "border-accent bg-accent/[.06]" : "border-line"
          }`}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
          <p className="font-medium">Drag a video here</p>
          <p className="max-w-sm text-sm text-muted">You can preview it, trim it, cut parts out, crop, add text and filters, and more before anything is uploaded.</p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="h-9 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Choose a video
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate font-medium">{file.name}</span>
          <span className="text-muted">{bytes(file.size)}</span>
          {info && (
            <span className="text-muted">
              {info.width}×{info.height} · {stamp(info.duration)}
            </span>
          )}
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="ml-auto text-accent hover:underline disabled:opacity-50">
            Choose a different video
          </button>
        </div>
      )}
      <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />

      {file && url && !info && (
        <p className="rounded-xl border border-line px-3 py-2 text-sm text-muted">This browser can&apos;t play that video, so it can&apos;t be previewed or edited. You can still upload it as it is.</p>
      )}

      {file && url && info && edits && (
        <VideoEditor url={url} duration={info.duration} edits={edits} onChange={setEdits} controlsRef={controls} onThumbnail={addThumb} />
      )}

      {file && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                <span className="flex justify-between">
                  Title <span className="font-normal tabular-nums text-muted">{title.length}/140</span>
                </span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                <span className="flex items-center justify-between">
                  Description
                  <span className="flex items-center gap-3 font-normal">
                    {info && (
                      <button type="button" onClick={addChapter} className="text-xs text-accent hover:underline" title="Adds the preview's current time as a chapter">
                        + Chapter at playhead
                      </button>
                    )}
                    <span className="tabular-nums text-muted">{description.length}/5000</span>
                  </span>
                </span>
                <textarea
                  ref={descBox}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  maxLength={5000}
                  placeholder={"Tell viewers about your video.\nChapters: lines like 1:23 Something happens"}
                  className={fieldClass}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Tags
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gaming, tutorial, vlog" className={fieldClass} />
                {tags.trim() && <span className="text-xs font-normal text-muted">Added to the description as {tagsToText(tags)}</span>}
              </label>
            </div>

            <div className="flex flex-col gap-2 text-sm font-medium">
              Thumbnail
              <div className="aspect-video overflow-hidden rounded-xl border border-line bg-panel">
                {thumbnail ? <Thumb blob={thumbnail} on={false} onClick={() => {}} label="Chosen thumbnail" /> : <div className="flex h-full items-center justify-center text-xs font-normal text-muted">Making suggestions…</div>}
              </div>
              {thumbs.length > 1 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {thumbs.map((b, i) => (
                    <Thumb key={i} blob={b} on={b === thumbnail} onClick={() => setThumbnail(b)} label={`Use thumbnail ${i + 1}`} />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-x-3 text-xs font-normal">
                <label className="cursor-pointer text-accent hover:underline">
                  Upload an image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const image = e.target.files?.[0];
                      if (image) addThumb(image);
                    }}
                  />
                </label>
                {info && (
                  <button
                    type="button"
                    className="text-accent hover:underline"
                    onClick={async () => {
                      const b = await controls.current?.snapshot();
                      if (b) addThumb(b);
                    }}
                  >
                    Use the preview&apos;s frame
                  </button>
                )}
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            <span>
              <span className="font-medium">This is a Short</span>
              <span className="block text-xs text-muted">
                Shows in the Shorts tab. Tall videos are picked automatically.
                {short && edits && edits.aspect !== "9:16" && info && info.width > info.height && " Tip: pick 9:16 under Crop & rotate."}
                {short && out > 180 && " Shorts are best under 3 minutes."}
              </span>
            </span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Visibility</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {VISIBILITY.map((v) => (
                <label
                  key={v.id}
                  className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    visibility === v.id ? "border-accent bg-accent/[.07]" : "border-line hover:bg-foreground/[.03]"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input type="radio" name="visibility" value={v.id} checked={visibility === v.id} onChange={() => setVisibility(v.id)} className="accent-[var(--accent)]" />
                    {v.label}
                  </span>
                  <span className="mt-0.5 text-xs text-muted">{v.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl bg-foreground/[.04] px-4 py-3 text-xs text-muted">
            {edited ? (
              <>
                <span className="font-medium text-foreground">Your edits are saved into the video when you upload</span> ({stamp(out)} long). It plays through once to do that, so keep this tab open.
              </>
            ) : (
              <>No edits, so the original file is uploaded as it is, at full quality.</>
            )}
            {draftSaved && <span className="block pt-1">Title, description, and tags are saved as a draft on this device.</span>}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {busy && (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-foreground/[.08]">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-sm text-muted">
            {phase === "rendering" ? "Saving your edits…" : "Uploading to Jace…"} {Math.round(progress * 100)}%{eta && ` · ${eta}`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {busy && (
          <button type="button" onClick={() => abort.current?.abort()} className="h-10 rounded-full border border-line px-5 text-sm font-medium hover:bg-foreground/[.05]">
            Cancel
          </button>
        )}
        {file && edited && !busy && (
          <button type="button" onClick={saveCopy} className="h-10 rounded-full border border-line px-5 text-sm font-medium hover:bg-foreground/[.05]">
            ⬇ Save edited copy
          </button>
        )}
        <button
          type="submit"
          disabled={!file || !title.trim() || busy}
          className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {phase === "rendering" ? "Saving edits…" : phase === "uploading" ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}
