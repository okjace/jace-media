import type { Metadata } from "next";
import { GoLive } from "@/components/live/GoLive";
import { PageTitle } from "@/components/PageTitle";

export const metadata: Metadata = { title: "Go live" };

export default function GoLivePage() {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Go live">Stream your camera or screen to Jace Media, with live chat. No ads.</PageTitle>
      <GoLive />
    </div>
  );
}
