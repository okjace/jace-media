import type { Metadata } from "next";
import { NetworkPage } from "@/components/feed/NetworkPage";

export const revalidate = 120;
export const metadata: Metadata = { title: "Mastodon" };

export default function Page() {
  return <NetworkPage network="mastodon" />;
}
