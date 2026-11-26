"use client";

/**
 * Pictures are made small in the browser before they're uploaded: at most
 * `max` pixels on the longest side, as WebP (or JPEG where WebP isn't
 * supported), usually a few hundred KB.
 */

async function load(file: File): Promise<{ img: HTMLImageElement; done: () => void }> {
  if (!file.type.startsWith("image/")) throw new Error("Pick a picture (PNG, JPEG, WebP, or GIF).");
  if (file.size > 40 * 1024 * 1024) throw new Error("That picture is over 40 MB.");
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't read that picture."));
    el.src = url;
  }).catch((err) => {
    URL.revokeObjectURL(url);
    throw err;
  });
  return { img, done: () => URL.revokeObjectURL(url) };
}

function draw(img: HTMLImageElement, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** A small WebP (or JPEG) of a picture, under `maxBytes`. */
export async function shrinkToBlob(file: File, max = 1600, maxBytes = 900 * 1024): Promise<Blob> {
  const { img, done } = await load(file);
  try {
    let canvas = draw(img, max);
    for (let attempt = 0; attempt < 6; attempt++) {
      const quality = 0.82 - attempt * 0.1;
      let blob = await toBlob(canvas, "image/webp", quality);
      if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
      if (blob && blob.size <= maxBytes) return blob;
      // Still too big: make it a bit smaller too.
      if (attempt >= 2) canvas = draw(img, Math.round(Math.max(canvas.width, canvas.height) * 0.8));
    }
    throw new Error("That picture is too detailed. Try a smaller one.");
  } finally {
    done();
  }
}

/** A small picture as a data: URL (the fallback when Jace's storage can't be reached). */
export async function shrinkImage(file: File, max = 1280): Promise<string> {
  const blob = await shrinkToBlob(file, max, 380 * 1024);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that picture."));
    reader.readAsDataURL(blob);
  });
}
