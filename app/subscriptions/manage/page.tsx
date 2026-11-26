import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { SubscriptionManager } from "@/components/SubscriptionManager";
import { getViewer } from "@/lib/auth";
import { listSubscriptions } from "@/lib/library";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage subscriptions" };

export default async function ManageSubscriptionsPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <a href="/api/auth/signin?next=/subscriptions/manage" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent">
        Sign in with Jace
      </a>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Your subscriptions">
        Everyone you follow, on every service. Put them in folders to get a feed per folder.{" "}
        <Link href="/import" className="text-accent hover:underline">
          Import from YouTube
        </Link>
      </PageTitle>
      <SubscriptionManager initial={await listSubscriptions(viewer.sub)} />
    </div>
  );
}
