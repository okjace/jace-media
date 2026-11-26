import type { Metadata } from "next";
import { ProfileForm } from "@/components/ProfileForm";
import { PageTitle } from "@/components/PageTitle";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit profile" };

export default async function SettingsPage() {
  const viewer = await getViewer();
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="Edit profile">
        Your handle is always your Jace username. Your name and picture start as your Jace ones; change them here to use different ones on
        Jace Media only. Jace itself doesn&apos;t change.
      </PageTitle>
      {viewer ? (
        <ProfileForm profile={viewer} />
      ) : (
        <a href="/api/auth/signin?next=/settings" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace
        </a>
      )}
    </div>
  );
}
