"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { confirmDialog } from "@/components/ui/Dialog";
import { LiveChat } from "@/components/live/LiveChat";
import { api, iceDone, QUALITIES, setBitrate, sleep, type Quality } from "@/lib/liveClient";
import { publishVideo } from "@/lib/uploadClient";

type Source = "camera" | "screen" | "both";
type Phase = "setup" | "starting" | "live" | "ended";
const MAX_PEERS = 15;

const field = "w-full rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const chip = (on: boolean) =>
  `rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${on ? "border-accent bg-accent/[.08]" : "border-line hover:bg-foreground/[.03]"}`;

/** Draws the screen with your camera in a corner, for "Screen + camera". */
function composite(screen: MediaStream, camera: MediaStream, q: (typeof QUALITIES)[Quality]) {
  const canvas = document.createElement("canvas");
  canvas.width = q.width;
  canvas.height = q.height;
  const ctx = canvas.getContext("2d")!;
  const sv = Object.assign(document.createElement("video"), { muted: true, playsInline: true, srcObject: screen });
  const cv = Object.assign(document.createElement("video"), { muted: true, playsInline: true, srcObject: camera });
  void sv.play();
  void cv.play();
  let raf = 0;
  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (sv.videoWidth) {
      const s = Math.min(canvas.width / sv.videoWidth, canvas.height / sv.videoHeight);
      const w = sv.videoWidth * s;
      const h = sv.videoHeight * s;
      ctx.drawImage(sv, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    }
    if (cv.videoWidth) {
      const w = canvas.width * 0.22;
      const h = (w * cv.videoHeight) / cv.videoWidth;
      const x = canvas.width - w - canvas.width * 0.02;
      const y = canvas.height - h - canvas.width * 0.02;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, w * 0.08);
      ctx.clip();
      ctx.drawImage(cv, x, y, w, h);
      ctx.restore();
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  const out = canvas.captureStream(30);
  return { stream: out, stop: () => cancelAnimationFrame(raf) };
}

export function GoLive() {
  const { current, showNotice } = useApp();
  const [phase, setPhase] = useState<Phase>("setup");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<Source>("camera");
  const [quality, setQuality] = useState<Quality>("720");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [record, setRecord] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [viewers, setViewers] = useState(0);
  const [peers, setPeers] = useState(0);
  const [mode, setMode] = useState<"p2p" | "cloudflare">("p2p");
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [replay, setReplay] = useState<Blob | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const preview = useRef<HTMLVideoElement>(null);
  const media = useRef<MediaStream | null>(null);
  const raw = useRef<MediaStream[]>([]);
  const stopComposite = useRef<(() => void) | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const cfPc = useRef<RTCPeerConnection | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const running = useRef(false);
  const idRef = useRef<string | null>(null);
  const [hasMedia, setHasMedia] = useState(false);

  // Cameras and microphones to choose from.
  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => {
        setCameras(list.filter((d) => d.kind === "videoinput"));
        setMics(list.filter((d) => d.kind === "audioinput"));
      })
      .catch(() => {});
  }, [phase]);

  function stopMedia() {
    stopComposite.current?.();
    stopComposite.current = null;
    for (const s of raw.current) s.getTracks().forEach((t) => t.stop());
    raw.current = [];
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    setHasMedia(false);
  }

  /** Opens the camera/screen and microphone and shows the preview. */
  async function openMedia() {
    stopMedia();
    setError(null);
    const q = QUALITIES[quality];
    try {
      const mic = micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true };
      const cam = { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: 30 }, ...(camId ? { deviceId: { exact: camId } } : {}) };
      let video: MediaStreamTrack;
      const audio: MediaStreamTrack[] = [];
      if (source === "camera") {
        const s = await navigator.mediaDevices.getUserMedia({ video: cam, audio: mic });
        raw.current.push(s);
        video = s.getVideoTracks()[0];
        audio.push(...s.getAudioTracks());
      } else {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: 30 } }, audio: true });
        raw.current.push(screen);
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: mic }).catch(() => null);
        if (micStream) raw.current.push(micStream);
        if (source === "both") {
          const camera = await navigator.mediaDevices.getUserMedia({ video: cam });
          raw.current.push(camera);
          const c = composite(screen, camera, q);
          stopComposite.current = c.stop;
          video = c.stream.getVideoTracks()[0];
        } else video = screen.getVideoTracks()[0];
        // Screen sound and microphone mixed into one track.
        const tracks = [...screen.getAudioTracks(), ...(micStream?.getAudioTracks() ?? [])];
        if (tracks.length > 1) {
          const ctx = new AudioContext();
          const dest = ctx.createMediaStreamDestination();
          for (const t of tracks) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest);
          audio.push(dest.stream.getAudioTracks()[0]);
        } else audio.push(...tracks);
        // Stopping the share from the browser's bar ends the stream.
        screen.getVideoTracks()[0].addEventListener("ended", () => running.current && void end(true));
      }
      const stream = new MediaStream([video, ...audio]);
      media.current = stream;
      setHasMedia(true);
      if (preview.current) {
        preview.current.srcObject = stream;
        void preview.current.play().catch(() => {});
      }
      return stream;
    } catch (err) {
      const name = (err as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Your browser blocked the camera, microphone, or screen. Allow it in the address bar and try again."
          : name === "NotFoundError"
            ? "No camera or microphone was found."
            : "Couldn't open your camera or screen.",
      );
      return null;
    }
  }

  /** Answers a viewer who wants to watch (peer-to-peer). */
  async function answerViewer(id: string, peer: string, offerSdp: string, ice: RTCIceServer[]) {
    if (pcs.current.size >= MAX_PEERS) {
      await api(`/api/live/${id}/signal`, "POST", { peer, kind: "full", payload: "full", toHost: false }).catch(() => {});
      return;
    }
    pcs.current.get(peer)?.close();
    const pc = new RTCPeerConnection({ iceServers: ice });
    pcs.current.set(peer, pc);
    setPeers(pcs.current.size);
    const stream = media.current!;
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      if (track.kind === "video") void setBitrate(sender, QUALITIES[quality].bitrate);
    }
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        setTimeout(() => {
          if (pc.connectionState !== "connected" && pcs.current.get(peer) === pc) {
            pc.close();
            pcs.current.delete(peer);
            setPeers(pcs.current.size);
          }
        }, pc.connectionState === "disconnected" ? 8000 : 0);
      }
    };
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await iceDone(pc);
    await api(`/api/live/${id}/signal`, "POST", { peer, kind: "answer", payload: pc.localDescription!.sdp, toHost: false });
  }

  /** Sends the stream to Cloudflare once (when it's set up). */
  async function publishCloudflare(id: string, ice: RTCIceServer[]) {
    const pc = new RTCPeerConnection({ iceServers: ice, bundlePolicy: "max-bundle" });
    cfPc.current = pc;
    const stream = media.current!;
    const transceivers = stream.getTracks().map((track) => {
      const t = pc.addTransceiver(track, { direction: "sendonly" });
      if (track.kind === "video") void setBitrate(t.sender, QUALITIES[quality].bitrate);
      return t;
    });
    await pc.setLocalDescription(await pc.createOffer());
    const { answer } = await api<{ answer: RTCSessionDescriptionInit }>(`/api/live/${id}/cf`, "POST", {
      offer: { type: "offer", sdp: pc.localDescription!.sdp },
      tracks: transceivers.map((t) => ({ mid: t.mid, trackName: `${id}-${t.sender.track!.kind}` })),
    });
    await pc.setRemoteDescription(answer);
  }

  function snapshot(): string | undefined {
    const v = preview.current;
    if (!v?.videoWidth) return undefined;
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = Math.round((480 * v.videoHeight) / v.videoWidth);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }

  async function goLive() {
    if (!title.trim()) return setError("Give your stream a title.");
    setPhase("starting");
    const stream = media.current ?? (await openMedia());
    if (!stream) return setPhase("setup");
    try {
      const res = await api<{ id: string; cloudflare: boolean; iceServers: RTCIceServer[] }>("/api/live", "POST", { title, description });
      setStreamId(res.id);
      idRef.current = res.id;
      running.current = true;
      setStarted(Date.now());
      setNow(Date.now());
      if (res.cloudflare) {
        try {
          await publishCloudflare(res.id, res.iceServers);
          setMode("cloudflare");
        } catch {
          setMode("p2p");
        }
      }
      if (record && typeof MediaRecorder !== "undefined") {
        chunks.current = [];
        const type = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
        const r = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: QUALITIES[quality].bitrate } : undefined);
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        r.start(2000);
        recorder.current = r;
      }
      setPhase("live");
      void loop(res.id, res.iceServers);
    } catch (err) {
      setError((err as Error).message);
      setPhase("setup");
    }
  }

  /** While live: answer viewers, check in, and update the thumbnail. */
  async function loop(id: string, ice: RTCIceServer[]) {
    let after = 0;
    let beat = 0;
    while (running.current) {
      try {
        const { signals } = await api<{ signals: { id: number; peer: string; kind: string; payload: string }[] }>(`/api/live/${id}/signal?host=1&after=${after}`);
        for (const s of signals) {
          after = Math.max(after, s.id);
          if (s.kind === "offer") void answerViewer(id, s.peer, s.payload, ice).catch(() => {});
        }
        if (Date.now() - beat > 10_000) {
          beat = Date.now();
          await api(`/api/live/${id}`, "PATCH", { action: "heartbeat", thumbnail: snapshot() });
          const info = await api<{ stream: { viewers: number } }>(`/api/live/${id}`);
          setViewers(info.stream.viewers);
        }
        setNow(Date.now());
      } catch {}
      await sleep(1500);
    }
  }

  async function end(fromBrowser = false) {
    if (!fromBrowser && !(await confirmDialog({ title: "End your stream?", message: "Viewers will see that it ended.", confirm: "End stream", danger: true }))) return;
    running.current = false;
    if (idRef.current) await api(`/api/live/${idRef.current}`, "PATCH", { action: "end" }).catch(() => {});
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    cfPc.current?.close();
    const r = recorder.current;
    if (r && r.state !== "inactive") {
      await new Promise<void>((resolve) => {
        r.onstop = () => resolve();
        r.stop();
      });
      if (chunks.current.length) setReplay(new Blob(chunks.current, { type: r.mimeType.split(";")[0] }));
    }
    stopMedia();
    setPhase("ended");
  }

  async function saveReplay() {
    if (!replay) return;
    setSaving(0);
    try {
      const ext = replay.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([replay], `${title.trim() || "Live stream"}.${ext}`, { type: replay.type });
      const { video } = await publishVideo({ file, title: title.trim() || "Live stream", description, visibility: "public" }, setSaving);
      showNotice({ kind: "info", text: "Your stream is saved as a video." });
      window.location.assign(`/watch/jace/${video.id}`);
    } catch (err) {
      setSaving(null);
      showNotice({ kind: "error", text: (err as Error).message });
    }
  }

  // Mic and camera switches while live.
  useEffect(() => {
    media.current?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn]);
  useEffect(() => {
    media.current?.getVideoTracks().forEach((t) => (t.enabled = camOn));
  }, [camOn]);

  // Leaving the page ends the stream.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => running.current && e.preventDefault();
    window.addEventListener("beforeunload", warn);
    // Closing the tab or leaving the page ends the stream right away.
    const leave = () => {
      if (running.current && idRef.current) {
        void fetch(`/api/live/${idRef.current}`, {
          method: "PATCH",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end" }),
        });
      }
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", leave);
      leave();
      running.current = false;
      for (const pc of pcs.current.values()) pc.close();
      cfPc.current?.close();
      stopMedia();
    };
  }, []);

  const elapsed = started ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  const clock = `${Math.floor(elapsed / 3600) ? `${Math.floor(elapsed / 3600)}:` : ""}${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  if (!current) {
    return (
      <a href="/api/auth/signin?next=/live/go" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
        Sign in with Jace to go live
      </a>
    );
  }

  if (phase === "ended") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-10 text-center">
        <span className="text-5xl" aria-hidden="true">🎬</span>
        <h2 className="text-2xl font-semibold">Stream ended</h2>
        <p className="text-muted">You were live for {clock}.</p>
        {replay && (
          <div className="flex w-full flex-col gap-2">
            <button type="button" onClick={saveReplay} disabled={saving !== null} className="h-11 rounded-full bg-accent font-semibold text-on-accent disabled:opacity-60">
              {saving !== null ? `Saving to Jace… ${Math.round(saving * 100)}%` : "Save the replay as a Jace video"}
            </button>
            <a href={URL.createObjectURL(replay)} download={`${title || "stream"}.${replay.type.includes("mp4") ? "mp4" : "webm"}`} className="h-11 rounded-full border border-line pt-2.5 font-medium hover:bg-foreground/[.05]">
              Download the replay
            </a>
          </div>
        )}
        <Link href="/live" className="text-sm text-accent hover:underline">
          Back to Live
        </Link>
      </div>
    );
  }

  const live = phase === "live";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
          <video ref={preview} muted playsInline className="h-full w-full object-contain" />
          {!hasMedia && phase === "setup" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white">
              <span className="text-4xl" aria-hidden="true">📹</span>
              <button type="button" onClick={openMedia} className="h-10 rounded-full bg-white/15 px-5 text-sm font-semibold backdrop-blur hover:bg-white/25">
                Preview {source === "camera" ? "camera" : "screen"}
              </button>
            </div>
          )}
          {live && (
            <div className="absolute left-3 top-3 flex items-center gap-2 text-xs font-semibold text-white">
              <span className="rounded-md bg-danger px-2 py-1">● LIVE {clock}</span>
              <span className="rounded-md bg-black/60 px-2 py-1">👁 {viewers}</span>
              <span className="rounded-md bg-black/60 px-2 py-1">{mode === "cloudflare" ? "☁ Cloudflare" : `⇄ ${peers}/${MAX_PEERS} direct`}</span>
            </div>
          )}
        </div>

        {live ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMicOn(!micOn)} className={chip(!micOn)}>
              {micOn ? "🎙 Mute mic" : "🔇 Mic muted"}
            </button>
            <button type="button" onClick={() => setCamOn(!camOn)} className={chip(!camOn)}>
              {camOn ? "📷 Hide video" : "🚫 Video hidden"}
            </button>
            <Link href={`/live/watch/${streamId}`} target="_blank" className={chip(false)}>
              ↗ Open viewer page
            </Link>
            <button type="button" onClick={() => end()} className="ml-auto h-10 rounded-full bg-danger px-5 text-sm font-semibold text-white">
              End stream
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="What are you streaming?" className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Description <span className="font-normal text-muted">(optional)</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} className={field} />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">Show</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["camera", "📷 Camera"],
                    ["screen", "🖥 Screen"],
                    ["both", "🖥 + 📷 Screen and camera"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => (stopMedia(), setSource(id))} className={chip(source === id)}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              {source !== "screen" && cameras.length > 1 && (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Camera
                  <select value={camId} onChange={(e) => (stopMedia(), setCamId(e.target.value))} className={field}>
                    <option value="">Default</option>
                    {cameras.map((c, i) => (
                      <option key={c.deviceId || i} value={c.deviceId}>
                        {c.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {mics.length > 1 && (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Microphone
                  <select value={micId} onChange={(e) => (stopMedia(), setMicId(e.target.value))} className={field}>
                    <option value="">Default</option>
                    {mics.map((m, i) => (
                      <option key={m.deviceId || i} value={m.deviceId}>
                        {m.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Quality
                <select value={quality} onChange={(e) => (stopMedia(), setQuality(e.target.value as Quality))} className={field}>
                  {(Object.keys(QUALITIES) as Quality[]).map((k) => (
                    <option key={k} value={k}>
                      {QUALITIES[k].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Record it, so you can save the replay as a video afterwards
            </label>
            {error && (
              <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-xs text-muted">People who follow you get a notification.</p>
              <button type="button" onClick={openMedia} className="h-11 rounded-full border border-line px-5 text-sm font-medium hover:bg-foreground/[.05]">
                Test preview
              </button>
              <button type="button" onClick={goLive} disabled={phase === "starting"} className="h-11 rounded-full bg-danger px-6 text-sm font-bold text-white disabled:opacity-60">
                {phase === "starting" ? "Starting…" : "● Go live"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="lg:h-[min(640px,calc(100dvh-8rem))]">
        {streamId ? (
          <LiveChat streamId={streamId} />
        ) : (
          <div className="flex h-full min-h-[200px] flex-col justify-center gap-2 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
            <p className="font-semibold text-foreground">Tips</p>
            <p>• Free and private: your video goes straight to viewers. Up to {MAX_PEERS} people can watch at once{" "}
              (more when Cloudflare is set up).</p>
            <p>• Use a wired connection or strong Wi-Fi.</p>
            <p>• Keep this tab open while you&apos;re live.</p>
          </div>
        )}
      </div>
    </div>
  );
}
