"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { bytes } from "@/lib/format";
import { captureThumbnail, publishVideo } from "@/lib/uploadClient";
import type { Visibility } from "@/lib/types";

const VISIBILITY: { id: Visibility; label: string; hint: string }[] = [
  { id: "public", label: "Public", hint: "Anyone can find and watch it." },
  { id: "unlisted", label: "Unlisted", hint: "Only people with the link can watch it." },
  { id: "private", label: "Private", hint: "Only you can watch it." },
];

export const fieldClass =
  "w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent";

/** Taller-than-wide videos are probably Shorts. */
function isVertical(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve(v.videoHeight > v.videoWidth);
      URL.revokeObjectURL(url);
    };
    v.onerror = () => {
      resolve(false);
      URL.revokeObjectURL(url);
    };
    v.src = url;
  });
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 140);
}

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [short, setShort] = useState(false);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!thumbnail) return;
    const url = URL.createObjectURL(thumbnail);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  async function choose(next: File | undefined) {
    if (!next) return;
    if (!next.type.startsWith("video/")) {
      setError("That isn't a video file.");
      return;
    }
    setError(null);
    setFile(next);
    if (!title) setTitle(titleFromName(next.name));
    setThumbnail(null);
    setThumbUrl(null);
    setThumbnail(await captureThumbnail(next));
    setShort(await isVertical(next));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void choose(e.dataTransfer.files[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      const { video } = await publishVideo(
        {
          file,
          thumbnail,
          title: title.trim(),
          // Jace marks Shorts with #shorts (Jace Media and JaceTube both read it).
          description: short && !/#shorts?\b/i.test(`${title} ${description}`) ? `${description.trim()}\n\n#shorts`.trim() : description.trim(),
          visibility,
        },
        setProgress,
        abort.current.signal,
      );
      router.push(short ? `/shorts?v=jace:${video.id}` : `/watch/jace/${video.id}`);
    } catch (err) {
      setProgress(null);
      if ((err as Error).name !== "AbortError") setError((err as Error).message || "Upload failed.");
    }
  }

  const uploading = progress !== null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-accent bg-accent/[.06]" : "border-line"
        }`}
      >
        {file ? (
          <>
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-muted">{bytes(file.size)}</p>
          </>
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
              <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
            </svg>
            <p className="font-medium">Drag a video here</p>
          </>
        )}
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="h-9 rounded-full border border-line px-4 text-sm font-medium transition-colors hover:bg-foreground/[.05] disabled:opacity-50"
        >
          {file ? "Choose a different file" : "Choose a file"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </div>

      {file && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[minmax(0,1fr)_240px]">
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Tell viewers about your video"
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Thumbnail
              <div className="aspect-video overflow-hidden rounded-xl border border-line bg-panel">
                {thumbUrl ? (
                  // A local object URL, so a plain <img>.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-normal text-muted">No preview</div>
                )}
              </div>
              <label className="cursor-pointer text-xs font-normal text-accent hover:underline">
                Choose an image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const image = e.target.files?.[0];
                    if (image) setThumbnail(image);
                  }}
                />
              </label>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input type="checkbox" checked={short} onChange={(e) => setShort(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            <span>
              <span className="font-medium">This is a Short</span>
              <span className="block text-xs text-muted">Shows in the Shorts tab. Tall videos are picked automatically.</span>
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
                    <input
                      type="radio"
                      name="visibility"
                      value={v.id}
                      checked={visibility === v.id}
                      onChange={() => setVisibility(v.id)}
                      className="accent-[var(--accent)]"
                    />
                    {v.label}
                  </span>
                  <span className="mt-0.5 text-xs text-muted">{v.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {uploading && (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-foreground/[.08]">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-sm text-muted">Uploading to Jace… {Math.round(progress * 100)}%</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {uploading && (
          <button
            type="button"
            onClick={() => abort.current?.abort()}
            className="h-10 rounded-full border border-line px-5 text-sm font-medium hover:bg-foreground/[.05]"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!file || !title.trim() || uploading}
          className="h-10 rounded-full bg-accent px-5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}
