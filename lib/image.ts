/** Shrinks a picture in the browser before upload: at most `max` px on its longest side, as JPEG (PNG/GIF kept for small files). */
export async function shrinkImage(file: File, max = 1280, quality = 0.85): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pick a picture (PNG, JPEG, WebP, or GIF).");
  if (file.size > 20 * 1024 * 1024) throw new Error("That picture is over 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that picture."));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL("image/jpeg", quality);
    // Keep it under the server's 400 KB limit.
    for (let qy = quality - 0.15; out.length * 0.75 > 390 * 1024 && qy > 0.3; qy -= 0.15) {
      out = canvas.toDataURL("image/jpeg", qy);
    }
    if (out.length * 0.75 > 390 * 1024) throw new Error("That picture is too detailed. Try a smaller one.");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
