"use client";

/**
 * Jace Media's video editor engine, all in the browser: nothing is sent
 * anywhere until you upload. The same drawFrame() paints the live preview
 * and the exported video, so the preview is exactly what gets uploaded.
 * Export plays the video once through a canvas and records it
 * (MediaRecorder), so it takes about as long as the edited video.
 */

export type Aspect = "original" | "16:9" | "9:16" | "1:1" | "4:5" | "4:3";
export type Look = "none" | "grayscale" | "sepia" | "warm" | "cool" | "vivid" | "fade" | "noir";
export type Resolution = "original" | "1080" | "720" | "480";

export type TextLayer = {
  id: string;
  text: string;
  /** Center of the text, 0–1 across and down the frame. */
  x: number;
  y: number;
  /** Text height as a share of the frame height. */
  size: number;
  color: string;
  box: boolean;
  bold: boolean;
  /** Shown between these source times (seconds). */
  from: number;
  to: number;
};

export type Edits = {
  start: number;
  end: number;
  /** Parts taken out of the middle (source seconds). */
  cuts: { from: number; to: number }[];
  speed: number;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  aspect: Aspect;
  zoom: number;
  /** Where the crop sits, -1 to 1 (0 is the middle). */
  panX: number;
  panY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  vignette: number;
  look: Look;
  volume: number;
  mute: boolean;
  fadeIn: number;
  fadeOut: number;
  texts: TextLayer[];
  resolution: Resolution;
};

export function defaultEdits(duration: number): Edits {
  return {
    start: 0,
    end: duration,
    cuts: [],
    speed: 1,
    rotate: 0,
    flipH: false,
    flipV: false,
    aspect: "original",
    zoom: 1,
    panX: 0,
    panY: 0,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    vignette: 0,
    look: "none",
    volume: 100,
    mute: false,
    fadeIn: 0,
    fadeOut: 0,
    texts: [],
    resolution: "original",
  };
}

/** True when the edits change nothing, so the original file can be uploaded as it is. */
export function isUnedited(e: Edits, duration: number): boolean {
  const d = defaultEdits(duration);
  return (
    e.start <= 0.05 &&
    e.end >= duration - 0.05 &&
    e.cuts.length === 0 &&
    e.texts.length === 0 &&
    (Object.keys(d) as (keyof Edits)[]).every((k) => ["start", "end", "cuts", "texts"].includes(k) || e[k] === d[k])
  );
}

const LOOKS: Record<Look, string> = {
  none: "",
  grayscale: "grayscale(100%)",
  sepia: "sepia(80%)",
  warm: "sepia(25%) saturate(130%) hue-rotate(-10deg)",
  cool: "saturate(110%) hue-rotate(15deg) brightness(102%)",
  vivid: "saturate(160%) contrast(110%)",
  fade: "contrast(85%) brightness(110%) saturate(80%)",
  noir: "grayscale(100%) contrast(140%) brightness(90%)",
};
export const LOOK_NAMES: Record<Look, string> = {
  none: "None",
  grayscale: "Black & white",
  sepia: "Sepia",
  warm: "Warm",
  cool: "Cool",
  vivid: "Vivid",
  fade: "Faded",
  noir: "Noir",
};

export type Geometry = {
  /** Size of the source after rotating. */
  rw: number;
  rh: number;
  /** The crop, in rotated-source pixels. */
  cx: number;
  cy: number;
  cw: number;
  ch: number;
  /** Output size. */
  width: number;
  height: number;
};

function ratio(aspect: Aspect, rw: number, rh: number): number {
  if (aspect === "original") return rw / rh;
  const [a, b] = aspect.split(":").map(Number);
  return a / b;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function geometry(e: Edits, vw: number, vh: number): Geometry {
  const sideways = e.rotate === 90 || e.rotate === 270;
  const rw = sideways ? vh : vw;
  const rh = sideways ? vw : vh;
  const r = ratio(e.aspect, rw, rh);
  let cw = rw;
  let ch = rw / r;
  if (ch > rh) {
    ch = rh;
    cw = rh * r;
  }
  cw /= e.zoom;
  ch /= e.zoom;
  const cx = ((rw - cw) / 2) * (1 + e.panX);
  const cy = ((rh - ch) / 2) * (1 + e.panY);
  // Resolution caps the short side.
  const cap = e.resolution === "original" ? Infinity : Number(e.resolution);
  const scale = Math.min(1, cap / Math.min(cw, ch), 3840 / Math.max(cw, ch));
  return { rw, rh, cx, cy, cw, ch, width: even(cw * scale), height: even(ch * scale) };
}

/** Seconds of the source that end up in the video. */
export function keptSeconds(e: Edits): number {
  let total = Math.max(0, e.end - e.start);
  for (const c of mergedCuts(e)) total -= Math.max(0, Math.min(c.to, e.end) - Math.max(c.from, e.start));
  return Math.max(0, total);
}

/** Length of the finished video. */
export function outputDuration(e: Edits): number {
  return keptSeconds(e) / e.speed;
}

export function mergedCuts(e: Edits): { from: number; to: number }[] {
  const list = e.cuts
    .map((c) => ({ from: Math.max(e.start, Math.min(c.from, c.to)), to: Math.min(e.end, Math.max(c.from, c.to)) }))
    .filter((c) => c.to - c.from > 0.01)
    .sort((a, b) => a.from - b.from);
  const out: { from: number; to: number }[] = [];
  for (const c of list) {
    const last = out[out.length - 1];
    if (last && c.from <= last.to) last.to = Math.max(last.to, c.to);
    else out.push({ ...c });
  }
  return out;
}

/** Where a source time lands in the finished video (seconds). */
export function toOutputTime(e: Edits, t: number): number {
  let kept = Math.max(0, Math.min(t, e.end) - e.start);
  for (const c of mergedCuts(e)) {
    if (t <= c.from) break;
    kept -= Math.min(t, c.to) - c.from;
  }
  return Math.max(0, kept) / e.speed;
}

/** If t is inside a cut (or outside the trim), where playback should jump to; otherwise null. */
export function skipTarget(e: Edits, t: number): number | "end" | null {
  if (t < e.start - 0.02) return e.start;
  if (t >= e.end - 0.02) return "end";
  for (const c of mergedCuts(e)) {
    if (t >= c.from && t < c.to) return c.to >= e.end - 0.02 ? "end" : c.to;
  }
  return null;
}

/** How bright the picture/sound is because of fades (0–1). */
export function fadeLevel(e: Edits, t: number): number {
  const out = toOutputTime(e, t);
  const total = outputDuration(e);
  let level = 1;
  if (e.fadeIn > 0) level = Math.min(level, out / e.fadeIn);
  if (e.fadeOut > 0) level = Math.min(level, (total - out) / e.fadeOut);
  return Math.max(0, Math.min(1, level));
}

function filterFor(e: Edits, scale: number): string {
  const parts = [LOOKS[e.look]];
  if (e.brightness !== 100) parts.push(`brightness(${e.brightness}%)`);
  if (e.contrast !== 100) parts.push(`contrast(${e.contrast}%)`);
  if (e.saturation !== 100) parts.push(`saturate(${e.saturation}%)`);
  if (e.hue) parts.push(`hue-rotate(${e.hue}deg)`);
  if (e.blur) parts.push(`blur(${(e.blur * scale).toFixed(1)}px)`);
  return parts.filter(Boolean).join(" ") || "none";
}

/** Paints one frame of the edited video. */
export function drawFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, e: Edits, g: Geometry, t: number): void {
  const { width, height } = g;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = width / g.cw;
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.filter = filterFor(e, scale);
  ctx.scale(scale, scale);
  ctx.translate(-g.cx, -g.cy);
  ctx.translate(g.rw / 2, g.rh / 2);
  ctx.rotate((e.rotate * Math.PI) / 180);
  ctx.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
  if (vw && vh) ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
  ctx.restore();

  if (e.vignette > 0) {
    const grad = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.hypot(width, height) / 2);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${(e.vignette / 100).toFixed(2)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  for (const layer of e.texts) {
    if (!layer.text.trim() || t < layer.from || t > layer.to) continue;
    const px = Math.max(8, layer.size * height);
    ctx.save();
    ctx.font = `${layer.bold ? "700" : "500"} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = layer.text.split("\n");
    const lineHeight = px * 1.2;
    const x = layer.x * width;
    const top = layer.y * height - ((lines.length - 1) * lineHeight) / 2;
    if (layer.box) {
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + px * 0.8;
      const h = lines.length * lineHeight + px * 0.4;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, top - lineHeight / 2 - px * 0.2, w, h, px * 0.25);
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = px * 0.15;
      ctx.shadowOffsetY = px * 0.04;
    }
    ctx.fillStyle = layer.color;
    lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight));
    ctx.restore();
  }

  const fade = fadeLevel(e, t);
  if (fade < 1) {
    ctx.fillStyle = `rgba(0,0,0,${(1 - fade).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function pickType(): { mime: string; ext: string } {
  const options = [
    { mime: "video/mp4;codecs=avc1.640028,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const o of options) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o.mime)) return o;
  throw new Error("This browser can't save edited videos. Try Chrome, Edge, Safari, or Firefox.");
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve) => target.addEventListener(event, () => resolve(), { once: true }));
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  const done = once(video, "seeked");
  video.currentTime = t;
  return done;
}

/**
 * Makes the edited video. Must start from a click (it plays sound into a
 * recorder, which browsers only allow after you click). Keep the tab open
 * while it runs.
 */
export async function renderEdited(
  file: File,
  e: Edits,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  const type = pickType();
  const audioCtx = new AudioContext();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  // The video has to be on the page for some browsers to keep decoding it.
  video.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  try {
    await audioCtx.resume();
    if (video.readyState < 1) await once(video, "loadedmetadata");
    const g = geometry(e, video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = g.width;
    canvas.height = g.height;
    const ctx = canvas.getContext("2d")!;

    const source = audioCtx.createMediaElementSource(video);
    const gain = audioCtx.createGain();
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(gain).connect(dest);

    const stream = canvas.captureStream(30);
    const audio = dest.stream.getAudioTracks()[0];
    if (audio && !e.mute) stream.addTrack(audio);

    const recorder = new MediaRecorder(stream, {
      mimeType: type.mime,
      videoBitsPerSecond: Math.min(16_000_000, Math.max(1_500_000, g.width * g.height * 4)),
      audioBitsPerSecond: 160_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size) chunks.push(ev.data);
    };
    const stopped = once(recorder, "stop");

    await seek(video, e.start);
    drawFrame(ctx, video, e, g, e.start);
    video.playbackRate = e.speed;
    recorder.start(1000);
    const total = keptSeconds(e) || 1;

    await new Promise<void>((resolve, reject) => {
      let busy = false;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        video.pause();
        resolve();
      };
      signal?.addEventListener("abort", () => {
        finished = true;
        video.pause();
        reject(new DOMException("Cancelled.", "AbortError"));
      });
      video.onended = finish;
      video.onerror = () => reject(new Error("The browser couldn't read this video."));
      const tick = async () => {
        if (finished) return;
        if (!busy) {
          const t = video.currentTime;
          const jump = skipTarget(e, t);
          if (jump === "end") return finish();
          if (jump !== null) {
            busy = true;
            recorder.pause();
            video.pause();
            await seek(video, jump);
            drawFrame(ctx, video, e, g, jump);
            recorder.resume();
            await video.play().catch(() => {});
            busy = false;
          } else {
            gain.gain.value = e.mute ? 0 : (e.volume / 100) * fadeLevel(e, t);
            drawFrame(ctx, video, e, g, t);
            onProgress(Math.min(0.999, (toOutputTime(e, t) * e.speed) / total));
          }
        }
        if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => void tick());
        else requestAnimationFrame(() => void tick());
      };
      video
        .play()
        .then(() => tick())
        .catch(() => reject(new Error("Couldn't play the video to save your edits. Click Upload again.")));
    });

    recorder.stop();
    await stopped;
    onProgress(1);
    const base = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File(chunks, `${base}-edited.${type.ext}`, { type: type.mime.split(";")[0] });
  } finally {
    video.pause();
    video.remove();
    URL.revokeObjectURL(url);
    void audioCtx.close();
  }
}

/** m:ss or h:mm:ss, for chapters. */
export function stamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
