/** The Jace Media mark: stacked feed cards with a play button (same as app/icon.svg). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="jm-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d2128" />
          <stop offset="1" stopColor="#0d0f12" />
        </linearGradient>
        <linearGradient id="jm-logo-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ae69a" />
          <stop offset="1" stopColor="#22b866" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#jm-logo-bg)" />
      <rect x="148" y="92" width="248" height="180" rx="40" fill="#3ddc84" opacity=".22" transform="rotate(-12 272 182)" />
      <rect x="132" y="128" width="256" height="188" rx="42" fill="#3ddc84" opacity=".45" transform="rotate(-6 260 222)" />
      <rect x="104" y="176" width="304" height="232" rx="52" fill="url(#jm-logo-card)" />
      <path d="M226 236c0-14 15-23 27-16l80 46c12 7 12 25 0 32l-80 46c-12 7-27-2-27-16z" fill="#0c1410" />
    </svg>
  );
}
