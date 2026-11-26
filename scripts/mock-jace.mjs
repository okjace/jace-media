// A local stand-in for Jace (sign-in + videos), for testing Jace Media end to
// end without touching the real Jace. Not used in production.
//
//   node scripts/mock-jace.mjs     # http://localhost:4000
//   JACE_URL=http://localhost:4000 JACE_CLIENT_ID=mock JACE_CLIENT_SECRET=mock npm run dev
//
// It behaves like Jace for an official app:
// - If you're "signed in to Jace" (a cookie on localhost:4000), /oauth/authorize
//   sends you straight back with a code, even with prompt=none.
// - Signed out, prompt=none answers error=login_required.
// - prompt=select_account (or signed out without prompt=none) shows an account picker.
// Pages: /  (pick who you're signed in to Jace as, or sign out of Jace)
//        /revoke?user=ada  (expire every token for that account → 401)
//        /ban?user=ada     (ban the account → userinfo banned: true)
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 4000);
const CLIENT = { id: "mock", secret: "mock" };
const SAMPLE = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const USERS = {
  ada: { sub: "u-ada", username: "ada", name: "Ada Lovelace", picture: null, banned: false, muted: false },
  linus: { sub: "u-linus", username: "linus", name: "Linus", picture: null, banned: false, muted: false },
  grace: { sub: "u-grace", username: "grace", name: "Grace Hopper", picture: null, banned: false, muted: false },
};
const videos = [
  { id: "v1", url: SAMPLE, title: "Ada's garden tour", description: "Flowers!", thumbnail_url: null, content_type: "video/mp4", size: 1000, visibility: "public", owner_id: "u-ada", owner_type: "user", owner_name: "ada", owner_picture: null, likes: 3, comment_count: 0, created_at: "2026-11-20T10:00:00.000Z" },
];
const codes = new Map(); // code -> { user, challenge }
const tokens = new Map(); // token -> username

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const html = (res, body, headers = {}) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(`<!doctype html><body style="font-family:sans-serif;max-width:420px;margin:40px auto">${body}</body>`);
};
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
const signedInAs = (req) => (req.headers.cookie ?? "").match(/mockjace=(\w+)/)?.[1] ?? null;
const back = (url, params) => {
  const u = new URL(url.searchParams.get("redirect_uri"));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("state", url.searchParams.get("state") ?? "");
  return u.toString();
};
const userFor = (req) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const name = tokens.get(token);
  return name ? USERS[name] : null;
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(req.method, url.pathname + url.search);

  if (url.pathname === "/") {
    const who = signedInAs(req);
    return html(
      res,
      `<h2>Mock Jace</h2><p>Signed in to Jace as: <b>${who ?? "nobody"}</b></p>` +
        Object.keys(USERS).map((u) => `<p><a href="/login?user=${u}">Sign in to Jace as ${u}</a></p>`).join("") +
        `<p><a href="/logout">Sign out of Jace</a></p>`,
    );
  }
  if (url.pathname === "/login") {
    res.writeHead(302, { "Set-Cookie": `mockjace=${url.searchParams.get("user")}; Path=/`, Location: url.searchParams.get("then") || "/" });
    return res.end();
  }
  if (url.pathname === "/logout") {
    res.writeHead(302, { "Set-Cookie": "mockjace=; Path=/; Max-Age=0", Location: "/" });
    return res.end();
  }
  if (url.pathname === "/revoke") {
    for (const [t, u] of tokens) if (u === url.searchParams.get("user")) tokens.delete(t);
    return html(res, "Revoked.");
  }
  if (url.pathname === "/ban") {
    USERS[url.searchParams.get("user")].banned = true;
    return html(res, "Banned.");
  }

  if (url.pathname === "/oauth/authorize") {
    if (url.searchParams.get("client_id") !== CLIENT.id) return html(res, "Unknown app");
    const prompt = url.searchParams.get("prompt") ?? "";
    const who = signedInAs(req);
    const issue = (user) => {
      const code = randomUUID();
      codes.set(code, { user, challenge: url.searchParams.get("code_challenge") });
      res.writeHead(302, { Location: back(url, { code }), "Set-Cookie": `mockjace=${user}; Path=/` });
      res.end();
    };
    if (url.searchParams.get("pick")) return issue(url.searchParams.get("pick"));
    if (prompt === "none") {
      if (!who) {
        res.writeHead(302, { Location: back(url, { error: "login_required" }) });
        return res.end();
      }
      return issue(who);
    }
    if (who && prompt !== "select_account") return issue(who);
    const self = new URL(url);
    return html(
      res,
      `<h2>Choose a Jace account</h2>` +
        Object.keys(USERS)
          .map((u) => {
            self.searchParams.set("pick", u);
            return `<p><a href="${self.pathname + self.search}">Continue as ${u}${u === who ? " (signed in)" : ""}</a></p>`;
          })
          .join(""),
    );
  }

  if (url.pathname === "/api/oauth/token" && req.method === "POST") {
    const body = new URLSearchParams(await readBody(req));
    const entry = codes.get(body.get("code"));
    codes.delete(body.get("code"));
    if (!entry || body.get("client_secret") !== CLIENT.secret) return json(res, 400, { error: "invalid_grant" });
    if (entry.challenge && createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url") !== entry.challenge) {
      return json(res, 400, { error: "invalid_grant", error_description: "PKCE mismatch" });
    }
    const token = randomUUID();
    tokens.set(token, entry.user);
    return json(res, 200, { access_token: token, token_type: "Bearer", scope: "profile videos" });
  }

  if (url.pathname === "/api/oauth/userinfo") {
    const user = userFor(req);
    if (!user) return json(res, 401, { error: "invalid_token" });
    return json(res, 200, { ...user, display_name: user.name });
  }

  if (url.pathname === "/api/oauth/videos") return json(res, 200, { videos, next_before: null });
  const m = url.pathname.match(/^\/api\/oauth\/videos\/([^/]+)$/);
  if (m) {
    const v = videos.find((x) => x.id === m[1]);
    return v
      ? json(res, 200, { video: { ...v, liked_by_me: false, can_manage: false, comments: [] } })
      : json(res, 404, { error: "not_found", error_description: "No such video." });
  }
  json(res, 404, { error: "not_found", error_description: "Not in the mock." });
}).listen(PORT, () => console.log(`Mock Jace on http://localhost:${PORT}`));
