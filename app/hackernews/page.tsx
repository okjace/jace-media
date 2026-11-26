import type { Metadata } from "next";
import { NetworkPage } from "@/components/feed/NetworkPage";

export const revalidate = 120;
export const metadata: Metadata = { title: "Hacker News" };

export default function Page() {
  return <NetworkPage network="hackernews" />;
}
