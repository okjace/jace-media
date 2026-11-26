import Link from "next/link";
import { Avatar } from "@/components/Avatar";

/** A profile picture with a red ring and a LIVE tag, for someone streaming right now. */
export function LiveAvatar({ name, src, size = 40, href }: { name: string; src?: string | null; size?: number; href?: string }) {
  const ring = Math.max(2, Math.round(size / 22));
  const inner = (
    <span className="relative inline-flex shrink-0 flex-col items-center" title={`${name} is live`}>
      <span
        className="rounded-full bg-gradient-to-tr from-danger via-[#ff5f6d] to-[#ff9966] motion-safe:animate-[jm-live-pulse_2s_ease-in-out_infinite]"
        style={{ padding: ring }}
      >
        <span className="block rounded-full bg-background" style={{ padding: Math.max(1, ring - 1) }}>
          <Avatar name={name} src={src} size={size - ring * 4} />
        </span>
      </span>
      <span
        className="absolute -bottom-1 rounded-[4px] border-2 border-background bg-danger px-1 font-bold uppercase leading-tight tracking-wide text-white"
        style={{ fontSize: Math.max(8, Math.round(size / 6)) }}
      >
        Live
      </span>
    </span>
  );
  return href ? (
    <Link href={href} aria-label={`${name} is live. Watch`}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
