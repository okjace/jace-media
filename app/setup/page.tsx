import type { Metadata } from "next";
import { SetupWizard } from "@/components/SetupWizard";
import { getAccountList } from "@/lib/auth";
import { getExtensions, getServices } from "@/lib/prefs";
import { LEVELS } from "@/lib/rating";
import { SERVICES } from "@/lib/services";
import { UNAVAILABLE_SERVICES } from "@/lib/live";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome" };

/** The first-run setup: account, services, and content filter. */
export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const [{ current }, services, ext, params] = await Promise.all([getAccountList(), getServices(), getExtensions(), searchParams]);
  const step = Number(params.step) || 0;
  return (
    <SetupWizard
      account={current}
      services={SERVICES.filter((s) => !UNAVAILABLE_SERVICES.includes(s.id)).map((s) => ({ id: s.id, label: s.label, blurb: s.blurb }))}
      initialServices={services.filter((s) => !UNAVAILABLE_SERVICES.includes(s))}
      levels={LEVELS}
      initialRating={ext.rating}
      initialStep={Math.max(0, Math.min(4, step))}
    />
  );
}
