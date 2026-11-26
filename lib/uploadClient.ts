"use client";

import type { JaceVideoDetail, Visibility } from "./types";

/**
 * Uploads go straight from the browser to Jace's storage: Jace Media's server
 * asks Jace for a signed upload URL (/api/uploads), the browser sends the
 * file there, and then /api/videos publishes it as a Jace video.
 */

type Ticket = { path: string; upload_url: string; method: "PUT"; headers: Record<string, string>; public_url: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; reauth?: boolean };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status}).`);
  }
  return data;
}

function send(ticket: Ticket, file: Blob, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, ticket.upload_url);
    for (const [k, v] of Object.entries(ticket.headers)) if (v) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        if (xhr.status === 413 || /too large|exceeded/i.test(body.message ?? "")) {
          message = "That file is bigger than Jace allows.";
        } else if (body.message) message = `Upload failed: ${body.message}`;
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

export async function uploadFile(
  kind: "video" | "thumbnail",
  file: Blob,
  filename: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const ticket = await api<Ticket>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      kind,
      filename,
      content_type: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
      size: file.size,
    }),
  });
  await send(ticket, file, onProgress, signal);
  return ticket.path;
}

/**
 * Uploads a picture to your folder on Jace's storage and returns its public
 * address. Pictures are made small first (see lib/image.ts).
 */
export async function uploadPicture(blob: Blob): Promise<string> {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const ticket = await api<Ticket>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({ kind: "thumbnail", filename: `picture.${ext}`, content_type: blob.type || "image/jpeg", size: blob.size }),
  });
  await send(ticket, blob);
  return ticket.public_url;
}

export type Publish = {
  file: File;
  thumbnail?: Blob | null;
  title: string;
  description?: string;
  visibility: Visibility;
};

/** Uploads a video (and its thumbnail) and publishes it on Jace. */
export async function publishVideo(
  input: Publish,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ video: JaceVideoDetail; created: boolean }> {
  let thumbnailPath: string | undefined;
  if (input.thumbnail) {
    try {
      thumbnailPath = await uploadFile("thumbnail", input.thumbnail, "thumbnail.jpg", undefined, signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      // A missing thumbnail shouldn't stop the video itself.
    }
  }
  const path = await uploadFile("video", input.file, input.file.name, (f) => onProgress?.(f * 0.98), signal);
  const result = await api<{ video: JaceVideoDetail; created: boolean }>("/api/videos", {
    method: "POST",
    body: JSON.stringify({
      path,
      title: input.title,
      description: input.description,
      visibility: input.visibility,
      thumbnail_path: thumbnailPath,
    }),
  });
  onProgress?.(1);
  return result;
}

/**
 * A JPEG frame from a video file, made in the browser, for the thumbnail.
 * Null if the browser can't decode that video.
 */
export function captureThumbnail(file: Blob, atSeconds = 1): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };
    const timer = setTimeout(() => done(null), 15_000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(atSeconds, Math.max(0, (video.duration || 0) - 0.1));
    };
    video.onseeked = () => {
      const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((video.videoWidth || 1280) * scale);
      canvas.height = Math.round((video.videoHeight || 720) * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          clearTimeout(timer);
          done(blob);
        },
        "image/jpeg",
        0.85,
      );
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    video.src = url;
  });
}
