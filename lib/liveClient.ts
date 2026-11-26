"use client";

/** Browser side of going live (see lib/golive.ts). */

export type StreamInfo = {
  stream: {
    id: string;
    title: string;
    description: string;
    host: { sub: string; handle: string; name: string; picture: string | null };
    hostSub: string;
    live: boolean;
    startedAt: string;
    viewers: number;
    cloudflare: boolean;
  };
  isHost: boolean;
  useCloudflare: boolean;
  iceServers: RTCIceServer[];
};

export async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until the connection has found its addresses, so one message carries everything (no trickle). */
export function iceDone(pc: RTCPeerConnection, timeout = 3000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, timeout);
    function done() {
      clearTimeout(t);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function peerId(): string {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/** Bytes received so far on a connection (for Cloudflare's monthly free amount). */
export async function bytesReceived(pc: RTCPeerConnection): Promise<number> {
  let total = 0;
  try {
    (await pc.getStats()).forEach((s) => {
      if (s.type === "inbound-rtp" && typeof s.bytesReceived === "number") total += s.bytesReceived;
    });
  } catch {}
  return total;
}

/** Prefer a good bitrate for the outgoing video. */
export async function setBitrate(sender: RTCRtpSender, maxBitrate: number): Promise<void> {
  try {
    const p = sender.getParameters();
    if (!p.encodings?.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = maxBitrate;
    await sender.setParameters(p);
  } catch {}
}

export const QUALITIES = {
  "480": { width: 854, height: 480, bitrate: 1_000_000, label: "480p · lighter" },
  "720": { width: 1280, height: 720, bitrate: 2_500_000, label: "720p · recommended" },
  "1080": { width: 1920, height: 1080, bitrate: 4_500_000, label: "1080p · needs fast internet" },
} as const;
export type Quality = keyof typeof QUALITIES;
