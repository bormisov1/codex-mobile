# Connect a phone to the existing Codex server

The app uses the running `codex-webui` service and its `codex app-server` child; it does not start another Codex backend. Today that service listens on `127.0.0.1:4545`, which a physical phone cannot reach. For a phone, install Tailscale on this PC and the phone and sign both into the same private network. Set the existing service's `HOST` in `/home/vlad/apps/codex-webui/.env` to this PC's Tailscale IPv4 address, then restart it with `systemctl --user restart codex-webui.service`. The app's server URL should be `http://<that-Tailscale-IP>:4545`.

Keep the WebUI's existing password. The app logs in through `/api/login`, then uses the WebUI session cookie and exact server `Origin` on API writes. Do not point the app at the raw Codex app-server process or expose port 4545 through router forwarding or a public tunnel. The WebUI service itself recommends localhost or Tailscale private access.

An Android emulator on this PC can generally reach the host loopback through `http://10.0.2.2:4545`; an iOS simulator on a different Mac needs the private-network address. A physical device should use the private-network address above.

Because `/api/events` has no replay cursor, the app should reload the open thread after reconnecting. Uploads and archive state live on the server; drafts and local UI preferences live on the device.
