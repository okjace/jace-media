export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

export function Unavailable({ what }: { what: string }) {
  return (
    <p role="status" className="mb-4 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
      {what} can&apos;t be reached right now. Try again in a minute.
    </p>
  );
}
