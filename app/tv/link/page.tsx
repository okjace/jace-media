import type { Metadata } from "next";
import { PageTitle } from "@/components/PageTitle";
import { TvLinkForm } from "@/components/tv/TvLinkForm";
import { getViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in on your TV" };

/** Where the TV's QR code leads: confirm signing the TV in. */
export default async function TvLinkPage({ searchParams }: PageProps<"/tv/link">) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const code = typeof sp.code === "string" ? sp.code.toUpperCase().slice(0, 6) : "";
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <PageTitle title="Sign in on your TV">Use Jace Media on your TV with the account you&apos;re signed in with here.</PageTitle>
      {viewer ? (
        <TvLinkForm code={code} name={viewer.name} />
      ) : (
        <a
          href={`/api/auth/signin?next=${encodeURIComponent(`/tv/link?code=${code}`)}`}
          className="flex h-12 items-center justify-center rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover"
        >
          Sign in with Jace first
        </a>
      )}
    </div>
  );
}
