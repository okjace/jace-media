# Private playback (free)

With Private playback, YouTube videos in Jace Media play through your own
[Invidious](https://invidious.io) server instead of YouTube's player. Invidious
fetches each video from YouTube and passes it on, so:

- YouTube never sees the people watching, only your server.
- Videos play in Jace Media's own player, with no YouTube player and no YouTube ads.
- Captions come through Invidious too.

If your server is down or YouTube blocks it, Jace Media quietly goes back to
YouTube's player, so nothing breaks.

> Using Invidious goes against YouTube's terms of service. YouTube sometimes
> blocks servers that run it, so it may not work every day.

## 1. Get a free server (Oracle Cloud "Always Free")

1. Sign up at <https://www.oracle.com/cloud/free/>. It asks for a card to check
   you're a real person, but Always Free resources never cost anything.
2. Create a **VM instance**: image **Ubuntu 24.04**, shape **VM.Standard.A1.Flex**
   (Ampere, Always Free) with 1 OCPU and 6 GB memory.
3. In its network settings (the subnet's security list), allow incoming TCP
   ports **80** and **443**.
4. Connect with SSH and install Docker: `curl -fsSL https://get.docker.com | sudo sh`.

Any always-on Linux computer works too. A computer at home also works, but then
YouTube sees your home internet address, which is less private.

## 2. Run Invidious

Follow the official Docker guide, which includes the **Invidious companion**
that newer versions need to play videos:
<https://docs.invidious.io/installation/#docker-compose-method-production>

When it asks for settings:

- `domain`: your server's address (see step 3), with `https_only: true` and `external_port: 443`.
- Make up your own random `hmac_key` and companion secret key, as the guide says.

## 3. Give it a free https address

Jace Media is served over https, so your server needs https too. Two free ways:

- **Cloudflare Tunnel** (no open ports needed): <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/>.
  Point a hostname at `http://localhost:3000`.
- **A free domain plus Caddy**: get a free name at <https://www.duckdns.org>, then
  run [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy) with
  `caddy reverse-proxy --from your-name.duckdns.org --to localhost:3000`.

Check it works: open `https://your-address/api/v1/videos/dQw4w9WgXcQ` in a
browser. You should see the video's details, not an error.

## 4. Turn it on in Jace Media

1. In Vercel: **jace-media → Settings → Environment Variables**, add
   `INVIDIOUS_URL` = `https://your-address` (no slash at the end), for Production.
2. Redeploy.
3. **Private playback** now shows on the Extensions page (on by default). The
   player says nothing different: you'll just notice YouTube videos have a
   picture-in-picture button and no YouTube ads.
