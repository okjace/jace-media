"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AUTO_SKIP, SEGMENT_INFO, type Segment } from "@/lib/segments";
import { YT_STATE, loadYouTubeApi, type YTPlayer } from "./youtubeApi";

/**
 * Jace Media's own video player, for Jace videos, YouTube videos, and Shorts.
 *
 * Jace videos play from Jace in a plain <video>. YouTube videos play in
 * YouTube's privacy-enhanced player with its controls hidden and Jace Media's
 * controls on top. Ads read inside videos (sponsors, self-promotion,
 * subscribe reminders) are skipped using SponsorBlock.
 *
 * Shortcuts (like YouTube): Space/K play, J/L ±10s, ←/→ ±5s, ↑/↓ volume,
 * M mute, F fullscreen, 0-9 jump to 0-90%, Shift+< / Shift+> speed.
 */

type Props = {
  source: "youtube" | "jace";
  id: string;
  /** The video file (Jace videos). */
  src?: string;
  poster?: string | null;
  title: string;
  segments?: Segment[];
  variant?: "full" | "short";
  /** Plays straight away (Shorts only start when on screen). */
  active?: boolean;
  /** Where autoplay goes when the video ends. */
  nextHref?: string | null;
  nextTitle?: string | null;
};

/** One interface over <video> and YouTube's player. */
type Engine = {
  play(): void;
  pause(): void;
  seek(t: number): void;
  time(): number;
  duration(): number;
  buffered(): number;
  volume(v: number): void;
  muted(m: boolean): void;
  rate(r: number): void;
  paused(): boolean;
};

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`jacemedia:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(`jacemedia:${key}`, JSON.stringify(value));
  } catch {}
}

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  play: "M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z",
  pause: "M7 4h3.5v16H7zM13.5 4H17v16h-3.5z",
  next: "M5 5.5v13a1 1 0 0 0 1.55.83L15 13.7V18.5h2.5v-13H15v4.8L6.55 4.67A1 1 0 0 0 5 5.5z",
  volume: "M4 9v6h4l5 5V4L8 9H4zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
  mute: "M4 9v6h4l5 5V4L8 9H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z",
  full: "M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z",
  exitFull: "M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z",
  pip: "M3 5h18v8h-2V7H5v10h6v2H3zm10 9h8v6h-8z",
  gear: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
};

export function VideoPlayer({ source, id, src, poster, title, segments = [], variant = "full", active = true, nextHref, nextTitle }: Props) {
  const router = useRouter();
  const short = variant === "short";
  const box = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const ytHost = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const skippedRef = useRef(new Set<number>());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: number } | null>(null);
  const [skipAds, setSkipAds] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [ytControls, setYtControls] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const posKey = `pos:${source}:${id}`;

  // Saved choices: volume, speed, ad skipping, autoplay.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setVolume(stored("volume", 1));
    setMuted(short ? stored("shortsMuted", false) : stored("muted", false));
    setRate(short ? 1 : stored("rate", 1));
    setSkipAds(stored("skipAds", true));
    setAutoplay(stored("autoplay", true));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [short]);

  const onReady = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    e.volume(stored("volume", 1));
    e.muted(short ? stored("shortsMuted", false) : stored("muted", false));
    if (!short) e.rate(stored("rate", 1));
    // Pick up where you left off.
    const resume = short ? 0 : stored(posKey, 0);
    if (resume > 5) e.seek(resume);
    setDuration(e.duration());
    setReady(true);
  }, [posKey, short]);

  // ----- Jace: a plain <video> -----
  useEffect(() => {
    if (source !== "jace") return;
    const v = videoEl.current;
    if (!v) return;
    engine.current = {
      play: () => {
        v.play().catch(() => {
          // Browsers only autoplay muted videos until you've interacted with the page.
          v.muted = true;
          setMuted(true);
          v.play().catch(() => {});
        });
      },
      pause: () => v.pause(),
      seek: (t) => {
        v.currentTime = Math.max(0, Math.min(t, v.duration || t));
      },
      time: () => v.currentTime,
      duration: () => v.duration || 0,
      buffered: () => (v.duration && v.buffered.length ? v.buffered.end(v.buffered.length - 1) / v.duration : 0),
      volume: (x) => {
        v.volume = x;
      },
      muted: (m) => {
        v.muted = m;
      },
      rate: (r) => {
        v.playbackRate = r;
      },
      paused: () => v.paused,
    };
    const events: [string, () => void][] = [
      ["loadedmetadata", onReady],
      ["play", () => (setPlaying(true), setEnded(false))],
      ["pause", () => setPlaying(false)],
      ["waiting", () => setWaiting(true)],
      ["playing", () => setWaiting(false)],
      ["ended", () => (setPlaying(false), setEnded(true))],
      ["error", () => setError("This video can't be played right now.")],
    ];
    for (const [name, fn] of events) v.addEventListener(name, fn);
    if (v.readyState >= 1) onReady();
    return () => {
      for (const [name, fn] of events) v.removeEventListener(name, fn);
      engine.current = null;
    };
  }, [source, onReady]);

  // ----- YouTube: their player, our controls -----
  useEffect(() => {
    if (source !== "youtube" || !ytHost.current) return;
    let player: YTPlayer | null = null;
    let cancelled = false;
    const mount = document.createElement("div");
    ytHost.current.appendChild(mount);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      player = new YT.Player(mount, {
        videoId: id,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: active ? 1 : 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          cc_load_policy: 0,
          origin: window.location.origin,
          ...(short ? { loop: 1, playlist: id } : {}),
        },
        events: {
          onReady: ({ target }) => {
            const p = target;
            engine.current = {
              play: () => p.playVideo(),
              pause: () => p.pauseVideo(),
              seek: (t) => p.seekTo(Math.max(0, t), true),
              time: () => p.getCurrentTime() || 0,
              duration: () => p.getDuration() || 0,
              buffered: () => p.getVideoLoadedFraction() || 0,
              volume: (x) => p.setVolume(Math.round(x * 100)),
              muted: (m) => (m ? p.mute() : p.unMute()),
              rate: (r) => p.setPlaybackRate(r),
              paused: () => p.getPlayerState() !== YT_STATE.PLAYING && p.getPlayerState() !== YT_STATE.BUFFERING,
            };
            onReady();
            if (active) p.playVideo();
          },
          onStateChange: ({ data }) => {
            setPlaying(data === YT_STATE.PLAYING || data === YT_STATE.BUFFERING);
            setWaiting(data === YT_STATE.BUFFERING);
            setEnded(data === YT_STATE.ENDED);
          },
          onError: () => setError("YouTube won't play this video here. Open it on YouTube instead."),
        },
      });
    });
    return () => {
      cancelled = true;
      engine.current = null;
      try {
        player?.destroy();
      } catch {}
      mount.remove();
    };
    // `active` only matters for the first load; Shorts play/pause below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, id, short, onReady]);

  // Shorts play when on screen and pause when scrolled away.
  useEffect(() => {
    if (!ready) return;
    if (active) engine.current?.play();
    else engine.current?.pause();
  }, [active, ready]);

  // The clock: time, buffering, saving your place, and skipping ads inside the video.
  useEffect(() => {
    const tick = setInterval(() => {
      const e = engine.current;
      if (!e) return;
      const t = e.time();
      if (!seekingRef.current) setTime(t);
      setDuration(e.duration());
      setBuffered(e.buffered());
      if (skipAds) {
        segments.forEach((s, i) => {
          if (AUTO_SKIP.includes(s.category) && !skippedRef.current.has(i) && t >= s.start && t < s.end - 0.4) {
            skippedRef.current.add(i);
            e.seek(s.end);
            setToast({ text: `Skipped ${SEGMENT_INFO[s.category].label.toLowerCase()}`, undo: i });
          }
        });
      }
    }, 250);
    const save = setInterval(() => {
      const e = engine.current;
      if (!e || short) return;
      const t = e.time();
      const d = e.duration();
      if (t > 10 && d && t < d - 20) store(posKey, Math.floor(t));
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(save);
    };
  }, [segments, skipAds, posKey, short]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // When it ends: forget the saved place, and count down to the next video.
  useEffect(() => {
    if (!ended || short) return;
    try {
      localStorage.removeItem(`jacemedia:${posKey}`);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoplay && nextHref) setCountdown(5);
  }, [ended, short, autoplay, nextHref, posKey]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      router.push(nextHref!);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, nextHref, router]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ----- actions -----
  const toggle = useCallback(() => {
    const e = engine.current;
    if (!e) return;
    if (ended) {
      e.seek(0);
      setCountdown(null);
    }
    if (e.paused()) e.play();
    else e.pause();
  }, [ended]);

  const seekTo = useCallback((t: number) => {
    const e = engine.current;
    if (!e) return;
    const target = Math.max(0, Math.min(t, e.duration() || t));
    e.seek(target);
    setTime(target);
    // Seeking back into an ad you skipped means you want to watch it.
    segments.forEach((s, i) => {
      if (target >= s.start && target < s.end) skippedRef.current.add(i);
    });
  }, [segments]);

  const changeVolume = useCallback((v: number) => {
    const x = Math.max(0, Math.min(1, v));
    engine.current?.volume(x);
    engine.current?.muted(x === 0);
    setVolume(x);
    setMuted(x === 0);
    store("volume", x);
    store(short ? "shortsMuted" : "muted", x === 0);
  }, [short]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    engine.current?.muted(next);
    if (!next && volume === 0) changeVolume(0.5);
    setMuted(next);
    store(short ? "shortsMuted" : "muted", next);
  }, [muted, volume, changeVolume, short]);

  const changeRate = useCallback((r: number) => {
    engine.current?.rate(r);
    setRate(r);
    store("rate", r);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else box.current?.requestFullscreen().catch(() => {});
  }, []);

  const pip = useCallback(() => {
    const v = videoEl.current;
    if (!v) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else v.requestPictureInPicture().catch(() => {});
  }, []);

  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 2500);
  }, []);

  // Keyboard shortcuts (full player only; Shorts use the arrow keys to move between Shorts).
  useEffect(() => {
    if (short) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      const eng = engine.current;
      if (!eng) return;
      const k = e.key;
      let handled = true;
      if (k === " " || k === "k" || k === "K") toggle();
      else if (k === "j" || k === "J") seekTo(eng.time() - 10);
      else if (k === "l" || k === "L") seekTo(eng.time() + 10);
      else if (k === "ArrowLeft") seekTo(eng.time() - 5);
      else if (k === "ArrowRight") seekTo(eng.time() + 5);
      else if (k === "ArrowUp") changeVolume(volume + 0.05);
      else if (k === "ArrowDown") changeVolume(volume - 0.05);
      else if (k === "m" || k === "M") toggleMute();
      else if (k === "f" || k === "F") toggleFullscreen();
      else if (k === "Home") seekTo(0);
      else if (k === "End") seekTo(eng.duration());
      else if (/^[0-9]$/.test(k)) seekTo((eng.duration() * Number(k)) / 10);
      else if (k === ">") changeRate(RATES[Math.min(RATES.length - 1, RATES.indexOf(rate) + 1)] ?? 1);
      else if (k === "<") changeRate(RATES[Math.max(0, RATES.indexOf(rate) - 1)] ?? 1);
      else handled = false;
      if (handled) {
        e.preventDefault();
        poke();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [short, toggle, seekTo, changeVolume, toggleMute, toggleFullscreen, changeRate, volume, rate, poke]);

  // ----- seek bar -----
  const bar = useRef<HTMLDivElement>(null);
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (duration || 0);
  };
  function onBarDown(e: ReactPointerEvent<HTMLDivElement>) {
    seekingRef.current = true;
    bar.current?.setPointerCapture(e.pointerId);
    setTime(timeAt(e.clientX));
  }
  function onBarMove(e: ReactPointerEvent<HTMLDivElement>) {
    const r = bar.current!.getBoundingClientRect();
    setHover({ x: e.clientX - r.left, t: timeAt(e.clientX) });
    if (seekingRef.current) setTime(timeAt(e.clientX));
  }
  function onBarUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!seekingRef.current) return;
    seekingRef.current = false;
    seekTo(timeAt(e.clientX));
  }

  const pct = (t: number) => (duration ? `${Math.min(100, (t / duration) * 100)}%` : "0%");
  const showUi = controls || !playing || menu;
  const hoverSegment = hover ? segments.find((s) => hover.t >= s.start && hover.t < s.end) : undefined;
  const btn = "flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white";

  return (
    <div
      ref={box}
      onPointerMove={poke}
      onPointerLeave={() => playing && setControls(false)}
      className={`group/player relative select-none overflow-hidden bg-black ${short ? "h-full w-full" : "aspect-video w-full"} ${
        fullscreen ? "!aspect-auto h-screen" : ""
      } ${!showUi && playing ? "cursor-none" : ""}`}
      aria-label={`Video player: ${title}`}
      role="region"
    >
      {source === "jace" ? (
        <video
          ref={videoEl}
          src={src}
          poster={poster ?? undefined}
          autoPlay={active}
          loop={short}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
        />
      ) : (
        // YouTube's frame is taller than the box, so its title bar and logo sit
        // outside it; the video itself stays the same size, centered.
        <div
          ref={ytHost}
          className={`absolute inset-x-0 -bottom-[120px] -top-[120px] [&_iframe]:h-full [&_iframe]:w-full ${ytControls ? "" : "pointer-events-none"}`}
        />
      )}

      {/* Clicks land here (not inside YouTube's player): click plays/pauses, double-click goes fullscreen. */}
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={toggle}
        onDoubleClick={short ? undefined : toggleFullscreen}
        className={`absolute inset-0 h-full w-full cursor-[inherit] ${ytControls ? "pointer-events-none" : ""}`}
      />

      {waiting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-12 w-12 animate-spin rounded-full border-4 border-white/25 border-t-white" />
        </div>
      )}
      {(!playing || !ready) && !waiting && !error && countdown === null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white">
            <Icon d={ICONS.play} size={32} />
          </span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">{error}</div>
      )}

      {toast && (
        <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/80 py-1.5 pl-4 pr-1.5 text-sm text-white">
          {toast.text}
          {toast.undo !== undefined && (
            <button
              type="button"
              onClick={() => {
                seekTo(segments[toast.undo!].start);
                setToast(null);
              }}
              className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {countdown !== null && nextHref && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-white">
          <p className="text-sm text-white/70">Up next in {countdown}</p>
          {nextTitle && <p className="line-clamp-2 max-w-md text-lg font-semibold">{nextTitle}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setCountdown(null)} className="rounded-full bg-white/15 px-4 py-2 text-sm hover:bg-white/25">
              Cancel
            </button>
            <button type="button" onClick={() => router.push(nextHref)} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent">
              Play now
            </button>
          </div>
        </div>
      )}

      {short ? (
        <>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <Icon d={muted || volume === 0 ? ICONS.mute : ICONS.volume} />
          </button>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-accent" style={{ width: pct(time) }} />
          </div>
        </>
      ) : (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-1.5 pt-12 transition-opacity duration-200 ${
            showUi ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {/* Seek bar, with SponsorBlock segments marked in their colors. */}
          <div
            ref={bar}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
            tabIndex={0}
            onPointerDown={onBarDown}
            onPointerMove={onBarMove}
            onPointerUp={onBarUp}
            onPointerLeave={() => setHover(null)}
            className="group/bar relative flex h-4 cursor-pointer touch-none items-center"
          >
            <div className="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover/bar:h-1.5">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${buffered * 100}%` }} />
              {segments.map((s, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0"
                  style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})`, background: SEGMENT_INFO[s.category].color, opacity: 0.85 }}
                />
              ))}
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: pct(time) }} />
              <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition-transform group-hover/bar:scale-100"
                style={{ left: pct(time) }}
              />
            </div>
            {hover && (
              <div
                className="pointer-events-none absolute bottom-6 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-xs text-white"
                style={{ left: hover.x }}
              >
                {fmt(hover.t)}
                {hoverSegment && <span style={{ color: SEGMENT_INFO[hoverSegment.category].color }}> · {SEGMENT_INFO[hoverSegment.category].label}</span>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 text-white">
            <button type="button" onClick={toggle} aria-label={playing ? "Pause (k)" : "Play (k)"} className={btn}>
              <Icon d={playing ? ICONS.pause : ICONS.play} />
            </button>
            {nextHref && (
              <button type="button" onClick={() => router.push(nextHref)} aria-label="Next video" title={nextTitle ?? "Next"} className={btn}>
                <Icon d={ICONS.next} />
              </button>
            )}
            <div className="group/vol flex items-center">
              <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute (m)" : "Mute (m)"} className={btn}>
                <Icon d={muted || volume === 0 ? ICONS.mute : ICONS.volume} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-label="Volume"
                className="w-0 accent-white opacity-0 transition-all group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
              />
            </div>
            <span className="ml-1 text-sm tabular-nums text-white/90">
              {fmt(time)} / {fmt(duration)}
            </span>
            <span className="flex-1" />
            {segments.some((s) => AUTO_SKIP.includes(s.category)) && skipAds && (
              <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80 sm:inline" title="Ads read inside this video are skipped (SponsorBlock)">
                Ad skip on
              </span>
            )}
            {rate !== 1 && <span className="text-xs text-white/80">{rate}×</span>}
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Settings" aria-expanded={menu} className={btn}>
                <Icon d={ICONS.gear} />
              </button>
              {menu && (
                <div role="menu" className="absolute bottom-12 right-0 z-20 w-64 rounded-xl bg-black/90 p-2 text-sm text-white shadow-xl backdrop-blur">
                  <p className="px-2 pb-1 pt-1 text-xs text-white/60">Speed</p>
                  <div className="grid grid-cols-4 gap-1 px-1 pb-2">
                    {RATES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => changeRate(r)}
                        className={`rounded-lg py-1 text-xs ${r === rate ? "bg-accent text-on-accent" : "hover:bg-white/10"}`}
                      >
                        {r === 1 ? "Normal" : `${r}×`}
                      </button>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-white/10">
                    Skip ads inside videos
                    <input
                      type="checkbox"
                      checked={skipAds}
                      onChange={(e) => {
                        setSkipAds(e.target.checked);
                        store("skipAds", e.target.checked);
                      }}
                      className="accent-[var(--accent)]"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-white/10">
                    Autoplay next video
                    <input
                      type="checkbox"
                      checked={autoplay}
                      onChange={(e) => {
                        setAutoplay(e.target.checked);
                        store("autoplay", e.target.checked);
                      }}
                      className="accent-[var(--accent)]"
                    />
                  </label>
                  {source === "youtube" && (
                    <label
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-white/10"
                      title="If YouTube shows one of its own ads, turn this on to press its Skip button"
                    >
                      Let me press YouTube&apos;s &quot;Skip ad&quot;
                      <input type="checkbox" checked={ytControls} onChange={(e) => setYtControls(e.target.checked)} className="accent-[var(--accent)]" />
                    </label>
                  )}
                  {segments.length > 0 && (
                    <p className="px-2 pt-1 text-[11px] leading-snug text-white/50">
                      {segments.length} part{segments.length === 1 ? "" : "s"} marked by SponsorBlock.
                    </p>
                  )}
                </div>
              )}
            </div>
            {source === "jace" && (
              <button type="button" onClick={pip} aria-label="Picture in picture" className={btn}>
                <Icon d={ICONS.pip} />
              </button>
            )}
            <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} className={btn}>
              <Icon d={fullscreen ? ICONS.exitFull : ICONS.full} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
