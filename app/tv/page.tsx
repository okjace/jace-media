import type { Metadata, Viewport } from "next";
import { TvApp } from "@/components/tv/TvApp";

export const metadata: Metadata = { title: "Jace Media for TV" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0d10" };

/** Jace Media's TV app (LG, Android TV, and any TV browser). */
export default function TvPage() {
  return <TvApp />;
}
