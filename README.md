# Modex

A React Native (Expo SDK 57, TypeScript) companion for the existing Codex WebUI HTTP service. It uses the service on port 4545; it does not run Codex on the phone. The mobile layout uses an original terminal mark, a thread drawer, a conversation view, a rounded composer, and native sheets with dark and light themes. The [ChatGPT App Store page](https://apps.apple.com/us/app/chatgpt/id6448311069) was used only as general mobile layout direction.

## Connect

1. Make the Codex WebUI server reachable from the phone at a stable origin. For direct Tailscale access, bind `HOST` to the server's Tailscale IP and enter `http://<Tailscale-IP>:4545` in the app; the VPN encrypts that private route. The default `127.0.0.1:4545` works only on the server machine. If using an HTTPS reverse proxy instead, set the server's `PUBLIC_ORIGIN` to that exact pathless HTTPS origin.
2. Build a development client (`npm run ios` or `npm run android`). Android can also use an EAS build. Expo Go cannot load the native cookie and speech modules.
3. Enter the full server origin and the WebUI password on the sign-in screen. The password is never persisted; only the server-issued HttpOnly session cookie is kept by the native cookie store. The origin and non-secret preferences/drafts are stored with AsyncStorage.

Every write, including login, sends the exact configured `Origin`. Authenticated JSON, SSE, image, and download requests send the native session cookie. The server does not support browser CORS access from another origin. iOS ATS and Android cleartext traffic are enabled so a local HTTP development host can be reached; use a private Tailscale route or private HTTPS reverse proxy for normal operation. Avoid exposing this full-machine Codex service to the public Internet.

## Development

Use Node 20.19.4+ or 22.13+ (the installed React Native engine minimum), then:

```sh
npm ci --include=dev
npm run typecheck
npm test
npm run doctor
npm run start
```

### Local browser preview

The browser preview renders the same React Native app with React Native Web and sends its API requests through a loopback proxy to the existing WebUI service. From this project folder, run:

```sh
npm ci --include=dev
npm run build:web
npm run preview:web
```

Open `http://127.0.0.1:8085` on the same PC and enter the existing Codex WebUI password. The server address is preset because browser cookies and the service's origin check require same-origin requests. The preview binds only to `127.0.0.1`; set `CODEX_BACKEND_ORIGIN` before starting the preview if the WebUI service is on another local origin, and set `PREVIEW_PORT` to change the browser port. Browser speech recognition and notifications depend on browser support and permissions; file sharing falls back to a download. Rebuild with `npm run build:web` after changing app code, then refresh the tab.

`npm run ios` uses the checked-in Xcode project; `npm run android` generates the Android project and runs locally. `npm run start` targets the development client. Build and store submission steps are in [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md). The iOS bundle ID is `com.prototypebyai.modex`; before Android submission, choose its final package ID. Keep Apple signing keys, `EXPO_TOKEN`, the WebUI password, and AMT keys outside the repository.

## Interface and server behavior

- Sign in/out; server URL; workspace selection; saved active thread and per-thread drafts.
- Search, pin, select, archive, restore, paginate, and refresh sessions. A short left swipe reveals the archive/restore action; a longer left swipe performs it. Long press enters selection mode.
- Read durable turns and render Markdown, local/data images, commentary, and tool activity. SSE streams live text, plans, tool/output updates, requests, and active-thread state. On SSE connect/reconnect, foreground, running-turn polling, and turn completion, the app reads the thread again because SSE has no replay IDs.
- Send messages with explicit restrictive/moderate/YOLO permission mode; **moderate is the default**. Choose reasoning effort and a per-workspace system prompt. Pick up to ten files (25 MiB each), upload as base64, preview images, dictate in Auto/Russian/English, stop a turn, and queue or interrupt and send while Codex works.
- `/` command list, including the WebUI's available commands and labeled CLI-only commands. Copy the latest reply, export Markdown through the native share sheet, browse/download authenticated gallery files, view usage and activity, optional completion notifications, and optional AMT status/key/tools.
- Per-thread automatic retry after a reported rate-limit reset. It is opt-in, persisted locally, and runs while the app process is active. The server must report a reset time. Failed work with attachments is retained from a send error; a failed turn reconstructed solely from server history can recover text but not the original upload records.

## Known service and native limits

The WebUI proxy only accepts `{decision}` for server-initiated requests. Command and file approvals work through the mobile approval sheet. Requests that need structured answers, such as `tool/requestUserInput` or permission grants, cannot be answered correctly through this server API; the app displays the request and directs the user to the Codex CLI instead of presenting a false approval action. Codex tools execute on the host; the app has no direct shell, MCP, web-search, or file-change API.

The gallery is for browsing and sharing; selecting a gallery item does not attach it to the composer, matching the current WebUI. Native file picking replaces browser drag/drop and pasted files. Completion notifications and automatic rate-limit retry require the app process to be running; neither is a server-side background job. A local mobile build and an authenticated device session are still needed to verify cookie handling, SSE lifecycle, speech recognition, image loading, and OS notifications on both platforms against the deployed server. The included checks cover TypeScript, pure protocol/history behavior, Expo dependency compatibility, and Metro bundles.
