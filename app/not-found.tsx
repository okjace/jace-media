import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted">That page, post, or profile doesn&apos;t exist.</p>
      <Link href="/" className="rounded-full bg-accent px-5 py-2 font-medium text-on-accent hover:bg-accent-hover">
        Go home
      </Link>
    </div>
  );
}
