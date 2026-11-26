"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FollowButton } from "@/components/actions/FollowButton";
import { LiveStage } from "@/components/live/LiveStage";
import { api, bytesReceived, iceDone, peerId, sleep, type StreamInfo } from "@/lib/liveClient";

type State = "connecting" | "playing" | "full" | "ended" | "error";

/** Watching a Jace Media live stream: connects through Cloudflare or straight to the streamer. */
export function LiveViewer({ streamId, initial }: { streamId: string; initial: StreamInfo }) {
  const [info, setInfo] = useState(initial);
  const [state, setState] = useState<State>(initial.stream.live ? "connecting" : "ended");
  const [muted, setMuted] = useState(true);
  const [via, setVia] = useState<"cloudflare" | "direct" | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const alive = useRef(true);
  const viaRef = useRef<"cloudflare" | "direct" | null>(null);

  useEffect(() => {
    alive.current = true;
    const peer = peerId();
    let lastBytes = 0;
    let attempts = 0;

    const attach = (conn: RTCPeerConnection) => {
      const stream = new MediaStream();
      conn.ontrack = (e) => {
        stream.addTrack(e.track);
        if (video.current && video.current.srcObject !== stream) {
          video.current.srcObject = stream;
          void video.current.play().catch(() => {});
        }
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === "connected") {
          attempts = 0;
          setState("playing");
        }
      };
    };

    async function viaCloudflare(ice: RTCIceServer[]) {
      const conn = new RTCPeerConnection({ iceServers: ice, bundlePolicy: "max-bundle" });
      pc.current = conn;
      attach(conn);
      const { sessionId, offer } = await api<{ sessionId: string; offer: RTCSessionDescriptionInit }>(`/api/live/${streamId}/cf`, "POST", {});
      await conn.setRemoteDescription(offer);
      await conn.setLocalDescription(await conn.createAnswer());
      await api(`/api/live/${streamId}/cf`, "PUT", { sessionId, answer: { type: "answer", sdp: conn.localDescription!.sdp } });
      setVia("cloudflare");
      viaRef.current = "cloudflare";
    }

    async function direct(ice: RTCIceServer[]) {
      const conn = new RTCPeerConnection({ iceServers: ice });
      pc.current = conn;
      attach(conn);
      conn.addTransceiver("video", { direction: "recvonly" });
      conn.addTransceiver("audio", { direction: "recvonly" });
      await conn.setLocalDescription(await conn.createOffer());
      await iceDone(conn);
      await api(`/api/live/${streamId}/signal`, "POST", { peer, kind: "offer", payload: conn.localDescription!.sdp, toHost: true });
      // Wait for the streamer's answer.
      for (let i = 0; i < 40 && alive.current; i++) {
        const { signals } = await api<{ signals: { kind: string; payload: string }[] }>(`/api/live/${streamId}/signal?peer=${peer}&after=0`);
        const answer = signals.find((s) => s.kind === "answer");
        if (signals.some((s) => s.kind === "full")) {
          setState("full");
          return;
        }
        if (answer) {
          await conn.setRemoteDescription({ type: "answer", sdp: answer.payload });
          setVia("direct");
          viaRef.current = "direct";
          return;
        }
        await sleep(1000);
      }
      throw new Error("The streamer didn't answer.");
    }

    async function connect() {
      pc.current?.close();
      setState("connecting");
      try {
        const latest = await api<StreamInfo>(`/api/live/${streamId}`);
        setInfo(latest);
        if (!latest.stream.live) return setState("ended");
        if (latest.useCloudflare) {
          try {
            return await viaCloudflare(latest.iceServers);
          } catch {}
        }
        await direct(latest.iceServers);
      } catch {
        if (alive.current) setState("error");
      }
    }

    void connect();
    // Count this viewer right away.
    void api(`/api/live/${streamId}/watch`, "POST", { peer, cfBytes: 0 }).catch(() => {});

    // Check in, count viewers, and reconnect if the picture stops.
    const timer = setInterval(async () => {
      const conn = pc.current;
      let cfBytes = 0;
      if (conn && viaRef.current === "cloudflare") {
        const total = await bytesReceived(conn);
        cfBytes = Math.max(0, total - lastBytes);
        lastBytes = total;
      }
      const res = await api<{ cloudflareOk: boolean }>(`/api/live/${streamId}/watch`, "POST", { peer, cfBytes }).catch(() => null);
      const latest = await api<StreamInfo>(`/api/live/${streamId}`).catch(() => null);
      if (latest) {
        setInfo(latest);
        if (!latest.stream.live) {
          conn?.close();
          return setState("ended");
        }
      }
      const broken = !conn || ["failed", "closed", "disconnected"].includes(conn.connectionState);
      // Over Cloudflare's free monthly amount: switch to a direct connection.
      const overCap = res && !res.cloudflareOk && viaRef.current === "cloudflare";
      if ((broken || overCap) && attempts < 5) {
        attempts++;
        lastBytes = 0;
        void connect();
      }
    }, 10_000);

    return () => {
      alive.current = false;
      clearInterval(timer);
      pc.current?.close();
    };
  }, [streamId]);

  const s = info.stream;
  return (
    <LiveStage
      player={
        <div ref={box} data-no-menu className="group relative aspect-video overflow-hidden rounded-2xl bg-black">
          <video ref={video} muted={muted} playsInline autoPlay className="h-full w-full object-contain" />
          {state !== "playing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              {state === "connecting" && (
                <>
                  <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden="true" />
                  <p className="text-sm text-white/80">Connecting to the stream…</p>
                </>
              )}
              {state === "ended" && (
                <>
                  <span className="text-4xl" aria-hidden="true">📺</span>
                  <p className="font-semibold">This stream has ended</p>
                  <Link href={`/u/${encodeURIComponent(s.host.handle)}`} className="text-sm text-accent hover:underline">
                    See {s.host.name}&apos;s videos
                  </Link>
                </>
              )}
              {state === "full" && (
                <>
                  <span className="text-4xl" aria-hidden="true">🙈</span>
                  <p className="font-semibold">This stream is full right now</p>
                  <p className="text-sm text-white/70">It&apos;s sent straight from the streamer, who can only reach so many people. Try again in a bit.</p>
                  <button type="button" onClick={() => location.reload()} className="rounded-full bg-white/15 px-4 py-1.5 text-sm hover:bg-white/25">
                    Try again
                  </button>
                </>
              )}
              {state === "error" && (
                <>
                  <p className="font-semibold">Couldn&apos;t connect</p>
                  <p className="text-sm text-white/70">Some networks block live video. Try another network, or wait a moment.</p>
                  <button type="button" onClick={() => location.reload()} className="rounded-full bg-white/15 px-4 py-1.5 text-sm hover:bg-white/25">
                    Try again
                  </button>
                </>
              )}
            </div>
          )}
          {state === "playing" && (
            <>
              <span className="absolute left-3 top-3 rounded-md bg-danger px-2 py-1 text-xs font-bold text-white">● LIVE</span>
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button type="button" onClick={() => setMuted(!muted)} className="rounded-full bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-white/25">
                  {muted ? "🔇 Tap for sound" : "🔊 Mute"}
                </button>
                <span className="ml-auto text-xs text-white/70">{via === "cloudflare" ? "via Cloudflare" : "direct"}</span>
                <button
                  type="button"
                  onClick={() => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen?.())}
                  className="rounded-full bg-white/15 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-white/25"
                  aria-label="Full screen"
                >
                  ⛶
                </button>
              </div>
              {muted && (
                <button type="button" onClick={() => setMuted(false)} className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
                  🔇 Unmute
                </button>
              )}
            </>
          )}
        </div>
      }
      title={s.title}
      host={{ name: s.host.name, picture: s.host.picture, href: `/u/${encodeURIComponent(s.host.handle)}`, note: `@${s.host.handle}` }}
      live={state !== "ended" && s.live}
      viewers={s.viewers}
      startedAt={s.startedAt}
      chatId={streamId}
      actions={
        !info.isHost && <FollowButton target={{ kind: "jace", ref: s.hostSub, name: s.host.name, picture: s.host.picture }} initial={false} label="Follow" />
      }
      below={s.description ? <p className="whitespace-pre-wrap rounded-2xl bg-foreground/[.04] p-4 text-sm">{s.description}</p> : null}
    />
  );
}
