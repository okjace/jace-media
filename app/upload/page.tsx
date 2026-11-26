import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { UploadForm } from "@/components/UploadForm";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload a video" };

export default async function UploadPage() {
  const viewer = await getViewer();
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Upload a video">
        It&apos;s saved on your Jace account as a Jace video, with no ads, and shows on JaceTube too. Up to 5 GB.{" "}
        <Link href="/studio" className="text-accent hover:underline">
          Your videos
        </Link>
      </PageTitle>
      {viewer ? (
        <UploadForm />
      ) : (
        <a href="/api/auth/signin?next=/upload" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
          Sign in with Jace to upload
        </a>
      )}
    </div>
  );
}
