/** The Jace Media mark: Jace's green rounded square with a J and a little feed. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M17.5 8v10.5a4.6 4.6 0 0 1-8.8 1.9" fill="none" stroke="var(--on-accent)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="23.5" cy="9.5" r="2" fill="var(--on-accent)" />
      <path d="M22.5 15h3M22.5 20h3" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
