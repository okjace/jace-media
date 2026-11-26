import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/PageTitle";
import { StudioList } from "@/components/StudioList";
import { listMyVideos } from "@/lib/jace";
import { getCurrent } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your videos" };

/** Every video on your Jace account (public, unlisted, and private). */
export default async function StudioPage() {
  const current = await getCurrent();
  if (!current) {
    return (
      <a href="/api/auth/signin?next=/studio" className="inline-flex rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
        Sign in with Jace
      </a>
    );
  }
  const page = await listMyVideos(current.token).catch(() => null);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <PageTitle title="Your videos">Everything on your Jace account. Only you can see private ones.</PageTitle>
        <Link href="/upload" className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover">
          Upload
        </Link>
      </div>
      {page === null ? (
        <p className="text-sm text-muted">Jace isn&apos;t answering right now. Try again in a minute.</p>
      ) : (
        <StudioList initial={page.videos} />
      )}
    </div>
  );
}
