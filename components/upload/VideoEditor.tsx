"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  drawFrame,
  geometry,
  LOOK_NAMES,
  mergedCuts,
  outputDuration,
  skipTarget,
  stamp,
  toOutputTime,
  fadeLevel,
  type Aspect,
  type Edits,
  type Look,
  type Resolution,
  type TextLayer,
} from "@/lib/videoEdit";

export type EditorControls = {
  /** The frame on screen, with your edits, as a JPEG (for the thumbnail). */
  snapshot: () => Promise<Blob | null>;
  /** Where the playhead is in the finished video. */
  outputTime: () => number;
};

type Tool = "trim" | "crop" | "adjust" | "speed" | "audio" | "text" | "quality";
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "trim", label: "Trim & cut", icon: "✂" },
  { id: "crop", label: "Crop & rotate", icon: "⬚" },
  { id: "adjust", label: "Color & filters", icon: "🎨" },
  { id: "speed", label: "Speed", icon: "⏩" },
  { id: "audio", label: "Sound & fades", icon: "🔊" },
  { id: "text", label: "Text", icon: "T" },
  { id: "quality", label: "Quality", icon: "⚙" },
];
const ASPECTS: { id: Aspect; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "16:9", label: "16:9 Wide" },
  { id: "9:16", label: "9:16 Short" },
  { id: "1:1", label: "1:1 Square" },
  { id: "4:5", label: "4:5 Portrait" },
  { id: "4:3", label: "4:3 Classic" },
];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const RESOLUTIONS: { id: Resolution; label: string; hint: string }[] = [
  { id: "original", label: "Original", hint: "Best quality" },
  { id: "1080", label: "1080p", hint: "Full HD" },
  { id: "720", label: "720p", hint: "Smaller file" },
  { id: "480", label: "480p", hint: "Smallest file" },
];
const COLORS = ["#ffffff", "#000000", "#2ec27e", "#f6d32d", "#ff7800", "#e01b24", "#3584e4", "#c061cb"];
const FRAME = 1 / 30;
const PREVIEW_MAX = 960;

const btn = "h-8 rounded-full border border-line px-3 text-xs font-medium transition-colors hover:bg-foreground/[.06] disabled:opacity-40";
const chip = (on: boolean) =>
  `h-8 rounded-full border px-3 text-xs font-medium transition-colors ${on ? "border-accent bg-accent/[.12] text-foreground" : "border-line hover:bg-foreground/[.05]"}`;

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  reset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  reset?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-2 tabular-nums text-muted">
          {Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {unit}
          {reset !== undefined && value !== reset && (
            <button type="button" onClick={() => onChange(reset)} className="text-accent hover:underline">
              Reset
            </button>
          )}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--accent)]" />
    </label>
  );
}

/** Small frames along the timeline, so you can see where you are. */
function useFilmstrip(url: string, duration: number, count = 12): string[] {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    if (!duration) return;
    let cancelled = false;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    const canvas = document.createElement("canvas");
    (async () => {
      await new Promise((r) => (v.readyState >= 1 ? r(null) : v.addEventListener("loadedmetadata", r, { once: true })));
      const h = 54;
      canvas.height = h;
      canvas.width = Math.round((v.videoWidth / (v.videoHeight || 1)) * h) || 96;
      const ctx = canvas.getContext("2d")!;
      const out: string[] = [];
      for (let i = 0; i < count && !cancelled; i++) {
        await new Promise<void>((r) => {
          v.addEventListener("seeked", () => r(), { once: true });
          v.currentTime = ((i + 0.5) / count) * duration;
        });
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        out.push(canvas.toDataURL("image/jpeg", 0.6));
        if (!cancelled) setFrames([...out]);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
      v.removeAttribute("src");
      v.load();
    };
  }, [url, duration, count]);
  return frames;
}

export function VideoEditor({
  url,
  duration,
  edits,
  onChange,
  controlsRef,
  onThumbnail,
}: {
  url: string;
  duration: number;
  edits: Edits;
  onChange: (next: Edits) => void;
  controlsRef: RefObject<EditorControls | null>;
  onThumbnail: (blob: Blob) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const editsRef = useRef(edits);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<Tool>("trim");
  const [cutFrom, setCutFrom] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 16, h: 9 });
  const history = useRef<{ past: Edits[]; future: Edits[]; last: number; key: string }>({ past: [], future: [], last: 0, key: "" });
  const [counts, setCounts] = useState({ past: 0, future: 0 });
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const bump = () => setCounts({ past: history.current.past.length, future: history.current.future.length });
  const frames = useFilmstrip(url, duration);

  useEffect(() => {
    editsRef.current = edits;
  }, [edits]);

  /** Changes edits, remembering the old ones for Undo (quick slider moves count as one step). */
  const change = useCallback(
    (patch: Partial<Edits>, key = Object.keys(patch).join()) => {
      const h = history.current;
      const now = Date.now();
      if (!(key === h.key && now - h.last < 600)) h.past.push(editsRef.current);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      h.last = now;
      h.key = key;
      onChange({ ...editsRef.current, ...patch });
      setCounts({ past: h.past.length, future: h.future.length });
    },
    [onChange],
  );
  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(editsRef.current);
    h.key = "";
    onChange(prev);
    bump();
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(editsRef.current);
    h.key = "";
    onChange(next);
    bump();
  };

  const paint = useCallback(() => {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c || !v.videoWidth) return;
    const e = editsRef.current;
    const g = geometry(e, v.videoWidth, v.videoHeight);
    const k = Math.min(1, PREVIEW_MAX / Math.max(g.width, g.height));
    const pg = { ...g, width: Math.round(g.width * k), height: Math.round(g.height * k) };
    if (c.width !== pg.width || c.height !== pg.height) {
      c.width = pg.width;
      c.height = pg.height;
      setSize({ w: pg.width, h: pg.height });
    }
    drawFrame(c.getContext("2d")!, v, e, pg, v.currentTime);
    v.muted = e.mute;
    v.volume = Math.min(1, e.volume / 100) * fadeLevel(e, v.currentTime);
  }, []);

  // Playing: keep painting frames and jump over the parts you cut.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const loop = () => {
      const e = editsRef.current;
      const jump = skipTarget(e, v.currentTime);
      if (jump === "end") {
        v.pause();
        v.currentTime = e.end;
      } else if (jump !== null && !v.paused) v.currentTime = jump;
      paint();
      setTime(v.currentTime);
      if (!v.paused) raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(loop);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      paint();
    };
    const onSeeked = () => {
      setDims({ w: v.videoWidth, h: v.videoHeight });
      paint();
      setTime(v.currentTime);
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("loadeddata", onSeeked);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("loadeddata", onSeeked);
    };
  }, [paint]);

  // Edits change: show them right away, even while paused.
  useEffect(() => {
    paint();
    if (video.current) video.current.playbackRate = edits.speed;
  }, [edits, paint]);

  useEffect(() => {
    controlsRef.current = {
      outputTime: () => toOutputTime(editsRef.current, video.current?.currentTime ?? 0),
      snapshot: () =>
        new Promise((resolve) => {
          const v = video.current;
          if (!v?.videoWidth) return resolve(null);
          const e = editsRef.current;
          const g = geometry(e, v.videoWidth, v.videoHeight);
          const k = Math.min(1, 1280 / Math.max(g.width, g.height));
          const c = document.createElement("canvas");
          const pg = { ...g, width: Math.round(g.width * k), height: Math.round(g.height * k) };
          c.width = pg.width;
          c.height = pg.height;
          drawFrame(c.getContext("2d")!, v, { ...e, fadeIn: 0, fadeOut: 0 }, pg, v.currentTime);
          c.toBlob(resolve, "image/jpeg", 0.88);
        }),
    };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef]);

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, t));
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime >= edits.end - 0.05 || v.currentTime < edits.start) v.currentTime = edits.start;
      void v.play();
    } else v.pause();
  };

  const cuts = useMemo(() => mergedCuts(edits), [edits]);
  const pct = (t: number) => `${(Math.max(0, Math.min(duration, t)) / (duration || 1)) * 100}%`;

  /** Drag the trim handles, or click the timeline to move the playhead. */
  const onTimeline = (e: ReactPointerEvent, handle?: "start" | "end") => {
    const bar = timeline.current;
    if (!bar) return;
    e.preventDefault();
    const at = (x: number) => {
      const r = bar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (x - r.left) / r.width)) * duration;
    };
    const apply = (x: number) => {
      const t = at(x);
      if (handle === "start") {
        const start = Math.min(t, editsRef.current.end - 0.2);
        change({ start }, "trim-start");
        seek(start);
      } else if (handle === "end") {
        const end = Math.max(t, editsRef.current.start + 0.2);
        change({ end }, "trim-end");
        seek(end);
      } else seek(t);
    };
    apply(e.clientX);
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const layer = edits.texts.find((t) => t.id === selected) ?? null;
  const setLayer = (id: string, patch: Partial<TextLayer>, key?: string) =>
    change({ texts: editsRef.current.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }, key ?? `text-${id}-${Object.keys(patch).join()}`);
  const addText = () => {
    const id = Math.random().toString(36).slice(2, 9);
    const from = Math.max(edits.start, time);
    change({
      texts: [
        ...edits.texts,
        { id, text: "Your text", x: 0.5, y: 0.82, size: 0.08, color: "#ffffff", box: false, bold: true, from, to: Math.min(edits.end, from + 4) },
      ],
    });
    setSelected(id);
    setTool("text");
  };

  // Drag the selected text around the preview.
  const onPreviewPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool !== "text" || !layer) return toggle();
    const c = e.currentTarget;
    const move = (x: number, y: number) => {
      const r = c.getBoundingClientRect();
      setLayer(layer.id, { x: Math.max(0, Math.min(1, (x - r.left) / r.width)), y: Math.max(0, Math.min(1, (y - r.top) / r.height)) }, `text-${layer.id}-pos`);
    };
    move(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
  };

  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || (tag === "INPUT" && (e.target as HTMLInputElement).type !== "range")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (e.key === " " || e.key === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowLeft" && tag !== "INPUT") seek(time - 5);
    else if (e.key === "ArrowRight" && tag !== "INPUT") seek(time + 5);
    else if (e.key === ",") seek(time - FRAME);
    else if (e.key === ".") seek(time + FRAME);
    else if (e.key === "i") change({ start: Math.min(time, edits.end - 0.2) });
    else if (e.key === "o") change({ end: Math.max(time, edits.start + 0.2) });
  };

  const out = outputDuration(edits);
  const g = dims?.w ? geometry(edits, dims.w, dims.h) : null;

  return (
    <div tabIndex={-1} onKeyDown={onKey} className="flex flex-col gap-3 rounded-2xl border border-line bg-panel/60 p-3 outline-none sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Edit &amp; preview</h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={undo} disabled={!counts.past} className={btn} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button type="button" onClick={redo} disabled={!counts.future} className={btn} title="Redo (Ctrl+Shift+Z)">
            ↷ Redo
          </button>
        </div>
      </div>

      {/* The preview: exactly what will be uploaded. */}
      <div className="relative flex max-h-[60vh] items-center justify-center overflow-hidden rounded-xl bg-black" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
        <canvas
          ref={canvas}
          onPointerDown={onPreviewPointer}
          className={`h-full max-h-[60vh] w-full object-contain ${tool === "text" && layer ? "cursor-move" : "cursor-pointer"}`}
        />
        {!playing && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Play preview"
            className="pointer-events-auto absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl text-white backdrop-blur"
          >
            ▶
          </button>
        )}
        <video ref={video} src={url} playsInline preload="auto" className="hidden" />
      </div>

      {/* Transport */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => seek(edits.start)} className={btn} title="Go to start">
          ⏮
        </button>
        <button type="button" onClick={() => seek(time - 5)} className={btn} title="Back 5 seconds (←)">
          −5s
        </button>
        <button type="button" onClick={() => seek(time - FRAME)} className={btn} title="Back one frame (,)">
          ◂ 1f
        </button>
        <button type="button" onClick={toggle} className="h-8 rounded-full bg-accent px-4 text-xs font-semibold text-on-accent hover:bg-accent-hover">
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button type="button" onClick={() => seek(time + FRAME)} className={btn} title="Forward one frame (.)">
          1f ▸
        </button>
        <button type="button" onClick={() => seek(time + 5)} className={btn} title="Forward 5 seconds (→)">
          +5s
        </button>
        <span className="ml-auto text-xs tabular-nums text-muted">
          {stamp(toOutputTime(edits, time))} / {stamp(out)}
          {Math.abs(out - duration) > 0.5 && <span className="hidden sm:inline"> · was {stamp(duration)}</span>}
        </span>
        <button
          type="button"
          onClick={async () => {
            const blob = await controlsRef.current?.snapshot();
            if (blob) onThumbnail(blob);
          }}
          className={btn}
        >
          🖼 Use frame as thumbnail
        </button>
      </div>

      {/* Timeline */}
      <div className="select-none">
        <div ref={timeline} onPointerDown={(e) => onTimeline(e)} className="relative h-14 cursor-pointer overflow-hidden rounded-lg bg-foreground/[.06]">
          <div className="absolute inset-0 flex">
            {frames.map((f, i) => (
              // Little frames made in the browser.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={f} alt="" className="h-full min-w-0 flex-1 object-cover" draggable={false} />
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 bg-black/65" style={{ width: pct(edits.start) }} />
          <div className="absolute inset-y-0 right-0 bg-black/65" style={{ left: pct(edits.end) }} />
          {cuts.map((c, i) => (
            <div
              key={i}
              className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,rgba(224,27,36,.55)_0_6px,rgba(0,0,0,.6)_6px_12px)]"
              style={{ left: pct(c.from), width: `calc(${pct(c.to)} - ${pct(c.from)})` }}
              title="Cut out"
            />
          ))}
          {cutFrom !== null && <div className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: pct(cutFrom) }} />}
          {edits.texts.map((t) => (
            <div key={t.id} className="absolute bottom-0 h-1.5 rounded-full bg-[#f6d32d]" style={{ left: pct(t.from), width: `calc(${pct(t.to)} - ${pct(t.from)})` }} />
          ))}
          <div className="absolute inset-y-0 border-y-2 border-accent" style={{ left: pct(edits.start), right: `calc(100% - ${pct(edits.end)})` }} />
          {(["start", "end"] as const).map((which) => (
            <div
              key={which}
              role="slider"
              aria-label={which === "start" ? "Trim start" : "Trim end"}
              aria-valuenow={Math.round(edits[which])}
              onPointerDown={(e) => {
                e.stopPropagation();
                onTimeline(e, which);
              }}
              className={`absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center bg-accent ${which === "start" ? "-translate-x-0 rounded-l-md" : "-translate-x-full rounded-r-md"}`}
              style={{ left: pct(edits[which]) }}
            >
              <span className="h-5 w-0.5 rounded bg-on-accent/70" />
            </div>
          ))}
          <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-white shadow" style={{ left: pct(time) }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
          <span>Start {stamp(edits.start)}</span>
          <span>End {stamp(edits.end)}</span>
        </div>
      </div>

      {/* Tools */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tool === t.id} onClick={() => setTool(t.id)} className={`${chip(tool === t.id)} shrink-0`}>
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line p-3">
        {tool === "trim" && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-xs text-muted">Drag the green handles, or set them at the playhead. Keys: I sets the start, O sets the end.</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btn} onClick={() => change({ start: Math.min(time, edits.end - 0.2) })}>
                [ Start here
              </button>
              <button type="button" className={btn} onClick={() => change({ end: Math.max(time, edits.start + 0.2) })}>
                End here ]
              </button>
              <button type="button" className={btn} onClick={() => change({ start: 0, end: duration, cuts: [] })}>
                Undo all trims
              </button>
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <p className="text-xs font-medium">Cut a part out of the middle</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {cutFrom === null ? (
                  <button type="button" className={btn} onClick={() => setCutFrom(time)}>
                    ✂ Start cut here
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="h-8 rounded-full bg-danger px-3 text-xs font-medium text-white"
                      onClick={() => {
                        if (Math.abs(time - cutFrom) > 0.05) change({ cuts: [...edits.cuts, { from: Math.min(cutFrom, time), to: Math.max(cutFrom, time) }] });
                        setCutFrom(null);
                      }}
                    >
                      ✂ End cut here
                    </button>
                    <button type="button" className={btn} onClick={() => setCutFrom(null)}>
                      Cancel
                    </button>
                    <span className="text-xs text-muted">From {stamp(cutFrom)}: move the playhead to where the cut ends.</span>
                  </>
                )}
              </div>
              {cuts.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {cuts.map((c, i) => (
                    <li key={i} className="flex items-center justify-between rounded-lg bg-foreground/[.04] px-3 py-1.5 text-xs">
                      <button type="button" className="tabular-nums hover:underline" onClick={() => seek(c.from)}>
                        {stamp(c.from)} – {stamp(c.to)} ({(c.to - c.from).toFixed(1)}s)
                      </button>
                      <button
                        type="button"
                        className="text-danger hover:underline"
                        onClick={() => change({ cuts: cuts.filter((_, j) => j !== i) })}
                      >
                        Put back
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tool === "crop" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {ASPECTS.map((a) => (
                <button key={a.id} type="button" className={chip(edits.aspect === a.id)} onClick={() => change({ aspect: a.id, panX: 0, panY: 0 })}>
                  {a.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btn} onClick={() => change({ rotate: ((edits.rotate + 270) % 360) as Edits["rotate"] })}>
                ⟲ Rotate left
              </button>
              <button type="button" className={btn} onClick={() => change({ rotate: ((edits.rotate + 90) % 360) as Edits["rotate"] })}>
                ⟳ Rotate right
              </button>
              <button type="button" className={chip(edits.flipH)} onClick={() => change({ flipH: !edits.flipH })}>
                ⇋ Mirror
              </button>
              <button type="button" className={chip(edits.flipV)} onClick={() => change({ flipV: !edits.flipV })}>
                ⇵ Flip
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Slider label="Zoom" value={edits.zoom} min={1} max={3} step={0.05} unit="×" reset={1} onChange={(zoom) => change({ zoom })} />
              <Slider label="Move left/right" value={edits.panX} min={-1} max={1} step={0.02} reset={0} onChange={(panX) => change({ panX })} />
              <Slider label="Move up/down" value={edits.panY} min={-1} max={1} step={0.02} reset={0} onChange={(panY) => change({ panY })} />
            </div>
          </div>
        )}

        {tool === "adjust" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LOOK_NAMES) as Look[]).map((l) => (
                <button key={l} type="button" className={chip(edits.look === l)} onClick={() => change({ look: l })}>
                  {LOOK_NAMES[l]}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Slider label="Brightness" value={edits.brightness} min={30} max={200} unit="%" reset={100} onChange={(brightness) => change({ brightness })} />
              <Slider label="Contrast" value={edits.contrast} min={30} max={200} unit="%" reset={100} onChange={(contrast) => change({ contrast })} />
              <Slider label="Saturation" value={edits.saturation} min={0} max={250} unit="%" reset={100} onChange={(saturation) => change({ saturation })} />
              <Slider label="Hue" value={edits.hue} min={-180} max={180} unit="°" reset={0} onChange={(hue) => change({ hue })} />
              <Slider label="Blur" value={edits.blur} min={0} max={20} step={0.5} unit="px" reset={0} onChange={(blur) => change({ blur })} />
              <Slider label="Vignette" value={edits.vignette} min={0} max={90} unit="%" reset={0} onChange={(vignette) => change({ vignette })} />
            </div>
            <p className="text-[11px] text-muted">Color filters need a recent browser (Chrome, Edge, Firefox, or Safari 18+). What you see in the preview is what gets uploaded.</p>
          </div>
        )}

        {tool === "speed" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {SPEEDS.map((s) => (
                <button key={s} type="button" className={chip(edits.speed === s)} onClick={() => change({ speed: s })}>
                  {s === 1 ? "Normal" : `${s}×`}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Finished length: {stamp(out)}. Voices keep their pitch.
            </p>
          </div>
        )}

        {tool === "audio" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={edits.mute} onChange={(e) => change({ mute: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              Remove the sound
            </label>
            <Slider label="Volume" value={edits.volume} min={0} max={200} unit="%" reset={100} onChange={(volume) => change({ volume })} />
            <div className="hidden sm:block" />
            <Slider label="Fade in" value={edits.fadeIn} min={0} max={5} step={0.25} unit="s" reset={0} onChange={(fadeIn) => change({ fadeIn })} />
            <Slider label="Fade out" value={edits.fadeOut} min={0} max={5} step={0.25} unit="s" reset={0} onChange={(fadeOut) => change({ fadeOut })} />
            <p className="text-[11px] text-muted sm:col-span-2">Fades work on the picture and the sound together. Volume above 100% is applied when the video is saved.</p>
          </div>
        )}

        {tool === "text" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={addText} className="h-8 rounded-full bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-hover">
                + Add text
              </button>
              {edits.texts.map((t, i) => (
                <button key={t.id} type="button" className={chip(selected === t.id)} onClick={() => (setSelected(t.id), seek(t.from))}>
                  {t.text.trim().slice(0, 16) || `Text ${i + 1}`}
                </button>
              ))}
            </div>
            {layer ? (
              <div className="flex flex-col gap-3">
                <textarea
                  value={layer.text}
                  onChange={(e) => setLayer(layer.id, { text: e.target.value }, `text-${layer.id}-text`)}
                  rows={2}
                  maxLength={200}
                  className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => setLayer(layer.id, { color: c })}
                      className={`h-7 w-7 rounded-full border-2 ${layer.color === c ? "border-accent" : "border-line"}`}
                      style={{ background: c }}
                    />
                  ))}
                  <input type="color" value={layer.color} onChange={(e) => setLayer(layer.id, { color: e.target.value })} className="h-7 w-9 cursor-pointer rounded" aria-label="Any color" />
                  <button type="button" className={chip(layer.bold)} onClick={() => setLayer(layer.id, { bold: !layer.bold })}>
                    <b>B</b> Bold
                  </button>
                  <button type="button" className={chip(layer.box)} onClick={() => setLayer(layer.id, { box: !layer.box })}>
                    ▭ Background
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Slider label="Size" value={Math.round(layer.size * 100)} min={3} max={25} unit="%" onChange={(v) => setLayer(layer.id, { size: v / 100 })} />
                  <Slider label="Across" value={Math.round(layer.x * 100)} min={0} max={100} unit="%" onChange={(v) => setLayer(layer.id, { x: v / 100 })} />
                  <Slider label="Down" value={Math.round(layer.y * 100)} min={0} max={100} unit="%" onChange={(v) => setLayer(layer.id, { y: v / 100 })} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="tabular-nums text-muted">
                    Shows {stamp(layer.from)} – {stamp(layer.to)}
                  </span>
                  <button type="button" className={btn} onClick={() => setLayer(layer.id, { from: Math.min(time, layer.to - 0.1) })}>
                    Show from here
                  </button>
                  <button type="button" className={btn} onClick={() => setLayer(layer.id, { to: Math.max(time, layer.from + 0.1) })}>
                    Hide from here
                  </button>
                  <button type="button" className={btn} onClick={() => setLayer(layer.id, { from: edits.start, to: edits.end })}>
                    Whole video
                  </button>
                  <button
                    type="button"
                    className="ml-auto text-danger hover:underline"
                    onClick={() => {
                      change({ texts: edits.texts.filter((t) => t.id !== layer.id) });
                      setSelected(null);
                    }}
                  >
                    Delete text
                  </button>
                </div>
                <p className="text-[11px] text-muted">Tip: drag on the preview to move the text.</p>
              </div>
            ) : (
              <p className="text-xs text-muted">Add titles, captions, or credits. Each one can show for part of the video.</p>
            )}
          </div>
        )}

        {tool === "quality" && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {RESOLUTIONS.map((r) => (
                <button key={r.id} type="button" onClick={() => change({ resolution: r.id })} className={`flex flex-col rounded-xl border px-3 py-2 text-left text-sm ${edits.resolution === r.id ? "border-accent bg-accent/[.08]" : "border-line hover:bg-foreground/[.03]"}`}>
                  <span className="font-medium">{r.label}</span>
                  <span className="text-xs text-muted">{r.hint}</span>
                </button>
              ))}
            </div>
            {g && (
              <p className="text-xs text-muted">
                Finished video: {g.width}×{g.height}, {stamp(out)} long.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
