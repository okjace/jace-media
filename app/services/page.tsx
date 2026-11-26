import type { Metadata } from "next";
import { PageTitle } from "@/components/PageTitle";
import { ServicesPicker } from "@/components/ServicesPicker";
import { UNAVAILABLE_SERVICES } from "@/lib/live";
import { getServices } from "@/lib/prefs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose services" };

export default async function ServicesPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Choose services">Pick where your content comes from. Turned-off services leave your tabs, For you, Videos, and Shorts.{" "}
        <a href="/setup" className="text-accent hover:underline">
          Replay setup
        </a>
      </PageTitle>
      <ServicesPicker initial={await getServices()} hidden={UNAVAILABLE_SERVICES} />
    </div>
  );
}
