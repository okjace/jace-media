import type { Network } from "@/lib/types";

const STYLE: Record<Network, { label: string; className: string }> = {
  jace: { label: "Jace", className: "bg-accent/15 text-accent" },
  bluesky: { label: "Bluesky", className: "bg-bsky/15 text-bsky" },
  mastodon: { label: "Mastodon", className: "bg-masto/15 text-masto" },
  lemmy: { label: "Lemmy", className: "bg-lemmy/15 text-lemmy" },
  hackernews: { label: "Hacker News", className: "bg-hn/15 text-hn" },
  rss: { label: "News", className: "bg-warn/15 text-warn" },
};

export function NetworkBadge({ network }: { network: Network }) {
  const s = STYLE[network];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.className}`}>{s.label}</span>;
}
