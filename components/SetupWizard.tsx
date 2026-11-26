"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { THEME_KEY } from "@/components/site/ThemeToggle";
import type { RatingLevel } from "@/lib/extensions";
import type { AccountSummary } from "@/lib/types";

type Option = { id: string; label: string; blurb: string };
const ICONS: Record<string, string> = {
  jace: "💬",
  jacevideos: "🎬",
  youtube: "▶",
  bluesky: "🦋",
  mastodon: "🐘",
  lemmy: "🐭",
  hackernews: "🟧",
  rss: "📰",
  jacelive: "🔴",
  twitch: "🟣",
};
const STEPS = ["Welcome", "Account", "Services", "Comfort", "Ready"];

/** Full-screen first-run setup. Everything here can be changed later. */
export function SetupWizard({
  account,
  services,
  initialServices,
  levels,
  initialRating,
  initialStep,
}: {
  account: AccountSummary | null;
  services: Option[];
  initialServices: string[];
  levels: { id: RatingLevel; name: string; blurb: string }[];
  initialRating: RatingLevel;
  initialStep: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [on, setOn] = useState<string[]>(initialServices);
  const [rating, setRating] = useState<RatingLevel>(initialRating);
  const [light, setLight] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLight(document.documentElement.dataset.theme === "light");
  }, []);

  function theme(next: boolean) {
    setLight(next);
    document.documentElement.setAttribute("data-theme", next ? "light" : "dark");
    try {
      localStorage.setItem(THEME_KEY, next ? "light" : "dark");
    } catch {}
  }

  async function finish(to = "/", skip = false) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skip ? {} : { services: on, rating }),
    }).catch(() => null);
    if (!res?.ok) {
      setSaving(false);
      setError("Couldn't save that. Check your connection and try again.");
      return;
    }
    window.location.assign(to);
  }

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const primary = "h-12 rounded-full bg-accent px-8 text-base font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50";
  const secondary = "h-12 rounded-full border border-line px-6 text-base font-medium transition-colors hover:bg-foreground/[.05]";

  return (
    <div className="fixed inset-0 z-[250] flex flex-col overflow-y-auto bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_70%)]" />
      <header className="relative flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="flex items-center gap-2 font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-lg" />
          Jace Media
        </span>
        <button type="button" onClick={() => finish("/", true)} disabled={saving} className="text-sm text-muted hover:text-foreground">
          Skip setup
        </button>
      </header>

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-10 sm:px-8">
        <ol className="mb-8 flex gap-1.5" aria-label="Setup steps">
          {STEPS.map((name, i) => (
            <li key={name} className="flex-1" aria-current={i === step ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full transition-colors ${i <= step ? "bg-accent" : "bg-foreground/10"}`} />
              <span className="sr-only">{name}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={112} height={112} className="rounded-[28px] shadow-2xl shadow-accent/20" />
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Welcome to Jace Media</h1>
              <p className="mx-auto max-w-md text-lg text-muted">Videos, Shorts, and posts from the places you like, all in one feed. No ads, ever.</p>
            </div>
            <ul className="grid w-full max-w-md gap-2 text-left text-sm">
              {[
                ["🚫", "No ads on anything you watch"],
                ["🔒", "Private: YouTube doesn't see you browsing"],
                ["✨", "Recommendations made just for you"],
              ].map(([icon, text]) => (
                <li key={text} className="flex items-center gap-3 rounded-xl bg-foreground/[.04] px-4 py-3">
                  <span aria-hidden="true">{icon}</span>
                  {text}
                </li>
              ))}
            </ul>
            <button type="button" onClick={next} className={primary} autoFocus>
              Get started
            </button>
          </section>
        )}

        {step === 1 && (
          <section className="flex flex-1 flex-col gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Your account</h1>
              <p className="mt-2 text-muted">Sign in with Jace to post, comment, subscribe, and keep your history on every device.</p>
            </div>
            {account ? (
              <div className="flex items-center gap-4 rounded-2xl border border-accent/40 bg-accent/[.06] p-5">
                <Avatar name={account.name} src={account.picture} size={56} />
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{account.name}</p>
                  <p className="text-sm text-muted">@{account.handle} · Signed in</p>
                </div>
                <span className="ml-auto text-2xl text-accent" aria-hidden="true">✓</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <a href="/api/auth/signin?next=/setup?step=2" className={`${primary} flex items-center justify-center`}>
                  Sign in with Jace
                </a>
                <button type="button" onClick={next} className={secondary}>
                  Continue without an account
                </button>
                <p className="text-center text-xs text-muted">You can sign in any time from the top right.</p>
              </div>
            )}
            <div className="mt-auto flex justify-between pt-6">
              <button type="button" onClick={back} className={secondary}>
                Back
              </button>
              {account && (
                <button type="button" onClick={next} className={primary}>
                  Next
                </button>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-1 flex-col gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">What do you want to see?</h1>
              <p className="mt-2 text-muted">Pick the services for your feed. YouTube, Jace videos, and Jace posts are on to start.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {services.map((s) => {
                const picked = on.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => setOn((list) => (picked ? list.filter((x) => x !== s.id) : [...list, s.id]))}
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                      picked ? "border-accent bg-accent/[.08]" : "border-line hover:bg-foreground/[.03]"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[.06] text-lg" aria-hidden="true">
                      {ICONS[s.id] ?? "•"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.label}</span>
                      <span className="block text-xs text-muted">{s.blurb}</span>
                    </span>
                    <span
                      className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${picked ? "border-accent bg-accent text-on-accent" : "border-line"}`}
                      aria-hidden="true"
                    >
                      {picked && "✓"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-auto flex justify-between pt-6">
              <button type="button" onClick={back} className={secondary}>
                Back
              </button>
              <button type="button" onClick={next} disabled={on.length === 0} className={primary}>
                {on.length === 0 ? "Pick at least one" : "Next"}
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-1 flex-col gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Make it comfortable</h1>
              <p className="mt-2 text-muted">Choose what to filter and how it looks.</p>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-semibold">Content filter</legend>
              {levels.map((l) => (
                <label
                  key={l.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                    rating === l.id ? "border-accent bg-accent/[.08]" : "border-line hover:bg-foreground/[.03]"
                  }`}
                >
                  <input type="radio" name="rating" checked={rating === l.id} onChange={() => setRating(l.id)} className="mt-1 accent-[var(--accent)]" />
                  <span>
                    <span className="block font-semibold">{l.name}</span>
                    <span className="block text-sm text-muted">{l.blurb}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-semibold">Theme</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: false, label: "Dark", swatch: "#111317" },
                  { id: true, label: "Light", swatch: "#f4f5f7" },
                ].map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    aria-pressed={light === t.id}
                    onClick={() => theme(t.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-4 font-medium transition-colors ${
                      light === t.id ? "border-accent bg-accent/[.08]" : "border-line hover:bg-foreground/[.03]"
                    }`}
                  >
                    <span className="h-8 w-8 rounded-lg border border-line" style={{ background: t.swatch }} aria-hidden="true" />
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="mt-auto flex justify-between pt-6">
              <button type="button" onClick={back} className={secondary}>
                Back
              </button>
              <button type="button" onClick={next} className={primary}>
                Next
              </button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-4xl text-on-accent" aria-hidden="true">
              ✓
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">You&apos;re all set</h1>
              <p className="mx-auto mt-2 max-w-md text-muted">Want recommendations like the ones you&apos;re used to? Bring over your YouTube subscriptions and history.</p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-3">
              <button type="button" onClick={() => finish("/")} disabled={saving} className={primary} autoFocus>
                {saving ? "Saving…" : "Start watching"}
              </button>
              {account && (
                <button type="button" onClick={() => finish("/import")} disabled={saving} className={secondary}>
                  Import from YouTube
                </button>
              )}
              <button type="button" onClick={back} disabled={saving} className="text-sm text-muted hover:text-foreground">
                Back
              </button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <p className="text-xs text-muted">
              Change any of this later in <Link href="/services" className="underline">Choose services</Link> and{" "}
              <Link href="/extensions" className="underline">Extensions</Link>.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
