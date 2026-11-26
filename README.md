# Jace Media

Posts and videos from everywhere in one app, with no ads. A Jace app, open source under the MIT license.

Next.js 16 (App Router), TypeScript, Tailwind 4 and Postgres, hosted on Vercel.

## What it does

- **Tabs for each service**: For you, Subscriptions, Videos, Shorts, Jace, Bluesky, Mastodon, Lemmy, Hacker News, plus a tab for each custom feed.
- **Choose services**: turn any service off; its tab disappears and it leaves For you, Videos and Shorts. Saved to your account (or this device when signed out).
- **Jace posts**: post text and pictures, like, reply, and delete, with your Jace Media profile.
- **Videos and Shorts**: YouTube and Jace videos together. Shorts play in a swipeable vertical feed.
- **Recommendations everywhere**: For you, Videos, Shorts, Up next and every network tab are ranked for you (see below).
- **Import from YouTube**: read a Google Takeout export in the browser; your subscriptions, watch history and likes come over and drive recommendations.
- **Custom feeds**: pick services, "Everything" or "Subscriptions only", posts / videos / Shorts, words to include or hide, and recommended or newest first. Presets include "Subscriptions only" and "Shorts from subscriptions".
- **Follow anyone**: subscribe to YouTube and Jace channels, follow Bluesky and Mastodon people and Lemmy communities.
- **Library**: who you follow, your watch history, clear history, and un-hide things you marked "Not interested".
- **Jace Media's own video player** for Jace videos, YouTube and Shorts: seek bar, speed, volume, fullscreen, picture-in-picture (Jace videos), resume where you left off, autoplay next, and YouTube's keyboard shortcuts (Space/K, J/L, ←/→, ↑/↓, M, F, 0-9, Shift+< / >).
- **No ads**:
  - Jace Media never shows ads, and Jace videos play straight from Jace.
  - Ads read inside YouTube videos (sponsors, self-promotion, "like and subscribe") are skipped automatically using [SponsorBlock](https://sponsor.ajay.app), and marked on the seek bar. You can undo a skip.
  - Posts marked #ad, #sponsored, or "paid partnership" are left out of every feed.
  - YouTube videos play in YouTube's privacy-enhanced player (youtube-nocookie.com) with no YouTube suggestions or overlays. YouTube can still run its own ads inside its player on some videos; removing those would mean bypassing YouTube's player, which its terms don't allow. If one appears, the player's settings let you press YouTube's "Skip ad".
- **Sign in with Jace**, automatically, plus an account switcher for every Jace account used on the device.
- **Profiles**: your handle is always your Jace username. Your name and picture start as your Jace ones and can be changed just for Jace Media.

## Recommendations

YouTube doesn't let other apps see its recommendations, so Jace Media builds its own from the same kinds of signals ([`lib/recommend.ts`](lib/recommend.ts)):

- Channels you watch most (imported YouTube history plus what you watch here), weighted toward recent watches.
- Your subscriptions and follows, and videos and posts you liked.
- How new and how popular something is.
- Topics from what you've watched lately (and, with a YouTube API key, searches for them).
- "Not interested" and "Don't recommend channel".
- Variety: one channel or network can't fill the page, and a little daily randomness keeps it fresh.

## Accounts (Sign in with Jace)

- **Automatic sign-in**: when nobody is signed in, the app redirects once to Jace's `/oauth/authorize` with `prompt=none` (PKCE S256). Signed in to Jace → straight back with a code. `login_required` or `consent_required` → a cookie remembers the try (10 minutes) and the normal "Sign in with Jace" button shows; no loops. After signing out on purpose, it never signs in automatically until you sign in yourself.
- **Account switcher**: every Jace account used on the device is kept in one AES-256-GCM encrypted, HTTP-only cookie (tokens never reach JavaScript or localStorage). The menu lists the current account first, then the others; switching uses that account's own token. An expired or revoked token (401) signs that account in again; a banned account (`banned: true` or 403 `account_banned`) is removed with a notice. "Add another Jace account" uses `prompt=select_account`. Remove, Sign out, and Sign out of all are in the menu.
- Token exchange (`urn:ietf:params:oauth:grant-type:token-exchange`) is not used.

## Setup

Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without `DATABASE_URL`, local development uses PGlite (Postgres in WebAssembly) in `./data/pglite`. Tables are created on first use.

### Testing against a mock Jace

[`scripts/mock-jace.mjs`](scripts/mock-jace.mjs) stands in for Jace's sign-in and videos API, with accounts ada, linus and grace:

```bash
node scripts/mock-jace.mjs   # http://localhost:4000
```

and in `.env.local`: `JACE_URL=http://localhost:4000`, `JACE_CLIENT_ID=mock`, `JACE_CLIENT_SECRET=mock`. Its home page lets you sign in to "Jace" as someone or sign out; `/revoke?user=ada` expires Ada's tokens and `/ban?user=ada` bans her.

### Deploying on Vercel

1. Import the repo in Vercel.
2. Add Neon from Vercel → Storage (sets `DATABASE_URL`).
3. Set `JACE_CLIENT_ID`, `JACE_CLIENT_SECRET`, `SESSION_SECRET` (and optionally `YOUTUBE_API_KEY`).

## Credits

Posts come from the public APIs of Bluesky, Mastodon, Lemmy and Hacker News, and belong to their authors; every post links back to where it was posted. Videos come from Jace and YouTube. Ad segments come from SponsorBlock.
