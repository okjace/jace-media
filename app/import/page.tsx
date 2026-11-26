import type { Metadata } from "next";
import { ImportWizard } from "@/components/ImportWizard";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import from YouTube" };

export default async function ImportPage() {
  const viewer = await getViewer();
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Import from YouTube">
        Bring your YouTube subscriptions, watch history, and likes, so your recommendations start out like YouTube&apos;s.
      </PageTitle>
      {viewer ? (
        <ImportWizard />
      ) : (
        <a href="/api/auth/signin?next=/import" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace to import
        </a>
      )}
    </div>
  );
}
