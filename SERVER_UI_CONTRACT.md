# Codex WebUI server–UI contract

Inspected 2026-10-16, independently of any mobile implementation. This is a description of the **current local deployment**, not a promised versioned API. `O` means observed in the running service or its loaded source; `S` means confirmed by the installed Codex app-server JSON schema; `I` means inferred and should be tested before depending on it.

## Provenance and boundary

- **O:** `127.0.0.1:4545` is a Node HTTP service (`/home/vlad/apps/codex-webui/server.js`, Git revision `8dbebcd`, package version `0.1.0`). The process started after `server.js` was last modified. The live `/app.js` bytes match `/home/vlad/apps/codex-webui/public/app.js`. An unauthenticated `GET /` returned `302 /login.html`, `GET /api/session` returned `401 {"error":"Authentication required"}`, and `POST /api/logout` without `Origin` returned `403 {"error":"Origin rejected"}`.
- **O:** The Node server spawns `codex app-server` with stdin/stdout pipes, runs `initialize` with `experimentalApi: true`, then sends `initialized`. The Codex child is not an HTTP listener. The installed child binary reports `codex-cli 0.160.1`.
- **S:** The schema details below come from `codex app-server generate-json-schema` using that installed binary, generated into `/tmp/codex-webui-contract-schema` for this inspection. The proxy sends JSON-RPC method names shown below and passes most results through unchanged.
- **I:** The HTTP interface is tailored to this browser UI and can change with this repository or the Codex binary. The schema describes the installed binary, but does not prove every response shape that the authenticated deployment would emit in all states.

## HTTP transport and authentication

- **O:** Default bind is `127.0.0.1:4545`; `HOST`, `PORT`, `PUBLIC_ORIGIN`, and `WORKSPACE_ROOT` configure it. `PUBLIC_ORIGIN`, if set, must be a pathless HTTPS origin. No TLS termination is implemented in Node. No WebSocket or CORS flow is implemented.
- **O:** JSON routes are under `/api/`. Normal responses use `Content-Type: application/json; charset=utf-8` and `{error: string}` on errors. File/image routes return binary streams. The event route uses `text/event-stream`.
- **O:** `POST /api/login` takes `{password: string}`. A correct password returns `200 {ok:true}` plus `Set-Cookie: codex_webui_session=<opaque>; HttpOnly; SameSite=Strict; Path=/; Max-Age=<seconds>`. The cookie has no `Secure` attribute in this implementation. Its random token is 32 bytes encoded base64url; only its SHA-256 hash and expiry are stored server-side. Default lifetime is 24 hours, configurable from 1 to 168 hours. Six bad attempts per remote socket address in one minute produce `429`. A bad password produces `401`. `POST /api/logout` invalidates that cookie and clears it. Other `/api/` calls require it; there is no bearer-token API.
- **O:** Every `POST`, `PUT`, `PATCH`, or `DELETE`, including login, must carry an `Origin` equal to `http://<HOST>:<PORT>`, `https://<HOST>:<PORT>`, or the configured `PUBLIC_ORIGIN`; missing or mismatched origin returns `403` before routing/auth. A client must use a reachable deployment origin and persist/send cookies. `GET` requests have no origin test. This is an exact string check, not a CORS negotiation. The proxy does not implement `OPTIONS` preflight.
- **O:** Security headers include `Cache-Control: no-store`, a same-origin CSP, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, and `Referrer-Policy: no-referrer`. The SSE route overrides cache control to `no-cache, no-transform`.
- **O:** Unauthenticated static access is allowed to `/login.html`, `/app.css`, `/app.js`, and `/viewport.js`; other static paths redirect to login. The authenticated root serves `index.html`. Static assets are filesystem reads from `public/`.
- **I:** A native mobile HTTP client can use this interface only if it can reach the host and send the exact expected Origin and cookie. A browser hosted on a different origin cannot use this API directly because its actual Origin fails the check and no CORS policy is provided. Any phone deployment details need separate verification.

## HTTP routes

All routes below require the session cookie except `POST /api/login`. A route's Codex result is passed through unless a wrapper is explicitly shown. `threadId`, `turnId`, and request IDs are URL component encoded by the browser UI.

| Route | Request and result | Backing action / notes |
| --- | --- | --- |
| `POST /api/login` | JSON `{password}` → `200 {ok:true}` + cookie | Local password check; 1 MiB default JSON body limit. |
| `POST /api/logout` | Any/empty JSON → `200 {ok:true}` + clearing cookie | Local session invalidation. |
| `GET /api/session` | → `{authenticated:true, workspaceRoot:string}` | Auth check and root path. |
| `GET /api/status` | → `{ok:true,codex:"connected",host,workspaceRoot,executionMode:"full-access"}` | Awaits bridge initialization; status label does not describe the selected per-turn permission preset. |
| `GET /api/workspaces` | → `{workspaces:[{name,path}]}` | Root itself (`name:"workspace"`) plus visible immediate child directories, alphabetically sorted. |
| `GET /api/activity` | → `{activeThreads:[{threadId,turnId,activeFlags,updatedAt}]}` | In-memory bridge state. `turnId` may be null. |
| `GET /api/events` | SSE frames described below | Persistent stream. |
| `GET /api/threads?archived=true&cursor=<opaque>` | → Codex `thread/list` response | Server always sets `limit:100`, updated time descending. `archived` is true only for exact string `true`; default false. |
| `POST /api/threads` | `{cwd?,permissionMode?,model?,personality?}` → `201` Codex `thread/start` response | Existing absolute `cwd` must resolve under `WORKSPACE_ROOT`; default root. `model`/`personality` pass through or null. |
| `GET /api/threads/:threadId` | → Codex `thread/read` response with turns | `includeTurns:true`; retries certain empty-history errors up to five attempts. |
| `POST /api/threads/:threadId/messages` | `{text:string,cwd?,effort?,systemPrompt?,amtToolsEnabled?,permissionMode?,attachments?}` → `202` Codex `turn/start` response | See turn input rules below. |
| `POST /api/threads/archive` | `{threadIds:string[]}` → `{archived:string[],failed:[{id,message}]}` | 1–500 nonempty IDs, each ≤128 chars; deduplicated, four concurrent `thread/archive` RPCs. Partial failure still HTTP 200. |
| `POST /api/threads/:threadId/commands/:action` | Optional JSON body → RPC result or `{ok:true}` | Actions: `compact`, `review`, `rename`, `fork`, `archive`, `unarchive`. See below. |
| `POST /api/threads/:threadId/turns/:turnId/interrupt` | Empty JSON → Codex `turn/interrupt` response | Requires actual active turn ID. |
| `POST /api/requests/:id` | `{decision:"accept"|"acceptForSession"|"decline"|"cancel"}` → `{ok:true}` | Resolves a pending app-server request by sending `{id,result:{decision}}` to Codex. See approval limitation below. |
| `GET /api/account/rate-limits` | → `{ok:true,...CodexResult}`; error → `502 {ok:false,error}` | Calls `account/rateLimits/read`; exceptional endpoint exposes bridge error message. |
| `POST /api/upload` | `{name?,dataBase64:string,mimeType?}` → `201 {file:{id,name,path,size,mimeType,isImage}}` | Base64 JSON upload, maximum decoded size 25 MiB. Server creates a UUID subdirectory. |
| `GET /api/gallery?cwd=<absolute>` | → `{files:[{name,path,size,modifiedAt,mimeType,isImage,source}]}` | `source` is `upload` or `workspace`; recursive scan to depth 5, latest 200 supported files. Default cwd is root. |
| `GET /api/image?path=<absolute>` | Image bytes, inline | Allowed extensions AVIF/GIF/JPEG/PNG/WebP, ≤25 MiB, real path under root/uploads. |
| `GET /api/file?path=<absolute>` | File bytes, attachment | Supported gallery extensions, ≤100 MiB, real path under root/uploads. |
| `POST /api/amt/connect` | `{key:string}` → `{ok:true,connected:true,key_prefix}` | Optional Agent Media Tools status check; validated key stored locally. Not a Codex app-server feature. |
| `DELETE /api/amt/connect` | Empty JSON → `{ok:true,connected:false}` | Removes saved AMT key. |
| `GET /api/amt/status` | → `{connected:false,message?,key_prefix?}` or `{connected:true,...remoteStatus,tools,tools_total,paid_tools_unlocked}` | Optional AMT bridge to configured base URL. Remote response fields are not fixed here. |

**O:** The command-to-RPC mapping is `compact` → `thread/compact/start`, `review` → `review/start` of uncommitted changes with inline delivery, `rename` → `thread/name/set`, `fork` → `thread/fork`, `archive` → `thread/archive`, and `unarchive` → `thread/unarchive`. `rename` requires a trimmed name of 1–120 characters. Unknown action returns 404. The browser exposes `compact`, `review`, `rename`, `fork`, and `archive` as slash commands; many CLI slash commands are explicitly marked unavailable in the UI. There is no generic `/api/tools` or generic Codex RPC endpoint.

### Minimal client exchange

These are **schematic** wire examples based on the proxy and schema, with IDs/paths replaced by placeholders. They are not recordings from an authenticated user session. All writes need the exact deployment `Origin`; after login, send the issued cookie on every request, including SSE.

```http
POST /api/login HTTP/1.1
Origin: http://127.0.0.1:4545
Content-Type: application/json

{"password":"<user-entered password>"}

HTTP/1.1 200 OK
Set-Cookie: codex_webui_session=<opaque>; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400

{"ok":true}
```

```http
POST /api/threads HTTP/1.1
Origin: http://127.0.0.1:4545
Cookie: codex_webui_session=<opaque>
Content-Type: application/json

{"cwd":"/absolute/workspace","permissionMode":"moderate"}

HTTP/1.1 201 Created

{"thread":{"id":"<thread-id>","cwd":"/absolute/workspace","status":{"type":"idle"},"turns":[],"preview":"", "...":"additional Codex fields"},"...":"thread settings"}
```

```http
POST /api/threads/<thread-id>/messages HTTP/1.1
Origin: http://127.0.0.1:4545
Cookie: codex_webui_session=<opaque>
Content-Type: application/json

{"text":"Summarize this project","cwd":"/absolute/workspace","permissionMode":"moderate","effort":"medium","attachments":[]}

HTTP/1.1 202 Accepted

{"turn":{"id":"<turn-id>","status":"inProgress","items":[]}}
```

The UI then listens to `GET /api/events` and fetches `GET /api/threads/<thread-id>` for durable history. If uploading, send the base64 payload to `POST /api/upload`, then pass only the returned `file.path` (with optional name/MIME) in `attachments` on the message request.

### Turn input and permissions

- **O:** `text` must be a string of at most 50,000 JavaScript characters. Empty/whitespace-only text is accepted only with at least one attachment. The server uses at most the first 10 attachment records. Each attachment `path` must resolve inside the upload area, must be a file, and must be ≤25 MiB. The turn request body limit is 2 MiB, independent of the upload route.
- **O:** The server attempts `thread/resume` before every `turn/start`, suppressing errors matching `already|active|loaded|no rollout found`. It builds Codex `input` in order: optional prefixed `systemPrompt` (trimmed and truncated to 8,000 chars), optional AMT tool catalog hint, trimmed user text, then attachments. Image extensions become `{type:"localImage",path}`. Other files become a text instruction naming their absolute path and MIME type; their bytes are not sent as a native file input.
- **O:** `turn/start` receives `threadId`, `input`, validated `cwd`, `approvalPolicy`, `approvalsReviewer:"user"`, `sandboxPolicy`, and `effort` (or null). `thread/start` receives `cwd`, optional `model`, `approvalPolicy`, `approvalsReviewer:"user"`, a string `sandbox`, and optional `personality`.
- **O:** `permissionMode:"restrictive"` maps to `approvalPolicy:"untrusted"`, read-only sandbox, network false. `"moderate"` maps to `"on-request"`, workspace-write sandbox rooted at `cwd`, network false. Any other value, **including omitted**, maps to `approvalPolicy:"never"` and danger-full-access. The browser's default preference is `moderate`; the server does not enforce that as its default. A new client should send its intended mode explicitly.
- **O:** Server validates that requested workspaces are absolute, exist, resolve through symlinks under `WORKSPACE_ROOT`, and are directories. Invalid workspace errors are 400 or 403.

### Codex passthrough result shapes

- **S:** `thread/list` has `{data:Thread[],nextCursor?:string|null,backwardsCursor?:string|null}`. `thread/read` has `{thread:Thread}`. `thread/start` and `thread/fork` include a `thread:Thread` plus settings (`cwd`, `model`, `sandbox`, `approvalPolicy`, etc.). `turn/start` has `{turn:Turn}`. `turn/interrupt` has an empty object schema. The UI accepts a few fallback shapes (`result.threads`/`result.items`, or a bare thread), but the current generated schema establishes the primary shapes.
- **S:** `Thread` includes `id`, `cwd`, `preview`, `status`, `turns`, `createdAt`, `updatedAt`, `modelProvider`, and other metadata. `status.type` is `notLoaded`, `idle`, `systemError`, or `active` (with `activeFlags`). `Turn` has `id`, `items`, `status` (`completed`, `interrupted`, `failed`, `inProgress`), and optional error/timestamps. Thread items are a discriminated union including `userMessage`, `agentMessage`, `reasoning`, `plan`, `commandExecution`, `fileChange`, `mcpToolCall`, `dynamicToolCall`, `collabAgentToolCall`, `webSearch`, and others. A new client should preserve unknown item types.
- **O:** The browser renders user items from `item.content`, assistant items from `item.text`/content variants, and commentary from `item.phase === "commentary"`. It displays activity for reasoning, plans, commands, file changes, MCP calls, web search, and unknown tool item types. It considers `thread/read` durable history and uses it to repair streamed UI state.
- **S:** The current rate-limit RPC response has `rateLimits` and may have `accountId`, `ordinaryUsageAllowed`, `rateLimitsByLimitId`, and other fields. Each rate window has `usedPercent` and optional `resetsAt`/`windowDurationMins`. The proxy adds `ok:true`; the browser mainly reads `rateLimits.primary`, `secondary`, `credits`, `planType`, and `limitName`.

## SSE contract and recovery

- **O:** `GET /api/events` returns unnamed SSE `data: <JSON>\n\n` frames. On connection it sends `{type:"connected",pendingRequests:[JSONRPCRequest],activeThreads:[ActiveThread],recentEvents:[{threadId,event,at}]}`. Every 15 seconds it sends a comment heartbeat `: ping <epochMs>`. There are no SSE event IDs or `Last-Event-ID` replay semantics.
- **O:** Subsequent frames are `{type:"codex_event",event:<unmodified app-server notification>}`, `{type:"server_request",request:<unmodified app-server request>}`, or `{type:"bridge_error",message}`. Notifications are broadcast to every connected session without server-side thread filtering. Clients must filter by `params.threadId` (or `params.thread.id` / `params.turn.threadId`).
- **O:** `activeThreads` is in-memory and updated from `thread/status/changed`, `turn/started`, `turn/completed`, and immediately after successful `turn/start`. `recentEvents` is in-memory, capped at 300, filtered to the last 10 minutes on connect, and only records `turn/plan/updated`, `item/started`, `item/completed`, `turn/started`, and `turn/completed`. Pending server requests are also in-memory. A proxy restart loses all three caches.
- **O:** The UI handles `thread/status/changed`, `turn/started`, `turn/completed`, `item/agentMessage/delta`, `item/started`, `item/completed`, `error`, `item/reasoning/summaryTextDelta`, `item/plan/delta`, `turn/plan/updated`, `item/commandExecution/outputDelta`, `item/fileChange/patchUpdated`, `turn/diff/updated`, `thread/tokenUsage/updated`, and `account/rateLimits/updated`. Other Codex notifications still pass through SSE but have no specific UI handler.
- **S:** For example, `turn/started`/`turn/completed` contain `{threadId,turn}`, `item/started`/`item/completed` contain `{threadId,turnId,item,...timestamp}`, and `turn/plan/updated` contains `{threadId,turnId,plan:[{step,status}],explanation?}`. The exact event `params` vary by method and should be parsed by method, allowing unknown fields.
- **O/S:** Example SSE frame shapes, with placeholders rather than captured user content:

  ```text
  data: {"type":"connected","pendingRequests":[],"activeThreads":[],"recentEvents":[]}

  data: {"type":"codex_event","event":{"method":"turn/started","params":{"threadId":"<thread-id>","turn":{"id":"<turn-id>","status":"inProgress","items":[]}}}}

  data: {"type":"codex_event","event":{"method":"item/agentMessage/delta","params":{"threadId":"<thread-id>","turnId":"<turn-id>","itemId":"<item-id>","delta":"Hello"}}}

  data: {"type":"server_request","request":{"id":42,"method":"item/commandExecution/requestApproval","params":{"threadId":"<thread-id>","turnId":"<turn-id>","itemId":"<item-id>","command":"echo hi"}}}
  ```

  A client answers that last request with `POST /api/requests/42`, Origin and cookie headers, and `{"decision":"accept"}`. The sample omits additional method-specific fields and should not be used as a full JSON-schema fixture.
- **O:** On a new SSE connection the UI re-reads the open thread. During a running turn it polls `GET /api/threads/:id` every 2 seconds. After completion it schedules catch-up reads at 250 ms through 30 seconds because SSE completion can precede durable final history. It also resyncs on focus/visibility/pageshow/online. Therefore SSE deltas are a low-latency view, **not** the sole source of chat history. The reconnect snapshot is limited and cannot guarantee a full event replay.

## Server-initiated requests and tool/function behavior

- **O:** The proxy forwards every app-server request with an `id` and `method` as `server_request`, retains it by ID, and accepts one HTTP response via `POST /api/requests/:id`. The browser displays approval UI for any request; it summarizes `commandExecution` and `fileChange` methods specially and otherwise shows the method and raw parameters.
- **S:** Current app-server request schemas include command execution approval, file change approval, permission approval, tool user input, MCP elicitation, dynamic tool calls, and others. Their required response bodies differ. The HTTP proxy always responds to Codex with `{decision:<one of four strings>}`. This is suitable for decision-shaped approval requests; it does **not** expose a general response body for requests such as `tool/requestUserInput` (`{answers:...}`) or permission profile grants (`{permissions:...}`). Support for those flows through this UI is unproven and likely incomplete.
- **O:** Tool execution itself happens within Codex on the host. The web client receives resulting item events/history; it does not call shell, patch, MCP, web search, or image tools via dedicated HTTP endpoints. AMT is separate: connecting its key stores it server-side; enabling AMT in a turn injects a tool-catalog text hint into Codex input, not native tool definitions.

## Errors, limits, and persistence

- **O:** `readJson` rejects invalid JSON with `400 {error:"Invalid JSON"}` and oversized requests with `413 {error:"Request too large"}` (default body cap 1 MiB). Route validators may return 400/403/404/413/415 with their specific `error` messages. Unknown routes return `404 {error:"Not found"}`; unknown command returns `404 {error:"Unsupported thread command"}`. Unhandled or app-server RPC failures are logged on the server and returned to HTTP clients as `500 {error:"Internal server error"}`. The rate-limit endpoint instead returns `502 {ok:false,error:<message>}`.
- **O:** Codex bridge RPCs time out after 120 seconds. If the child exits, all pending RPCs fail and SSE gets `bridge_error`; the code does not automatically respawn it. The UI's generic JSON request helper redirects to `/login.html` on 401. A network/SSE failure is handled by reconnect plus thread reads.
- **O:** Auth sessions persist in `data/auth-sessions.json` as hashed-token/expiry pairs, mode 0600, and are restored across Node restarts. Uploaded files persist in `data/uploads/<UUID>/<sanitized-name>` with file mode 0600; no upload deletion or cleanup route is implemented. The optional AMT key is stored in `data/amt.json`, mode 0600. Do not copy either credentials file into a mobile project.
- **O:** Codex owns thread/turn/archive persistence in its local installation. The Node proxy has no separate conversation database. The browser stores preferences, draft text, the selected thread, pinned IDs, queued messages, and automatic rate-limit resume data in `localStorage`; that state is per browser profile, not synchronized by this API. A queued message can therefore disappear from another device's view even when its thread exists on the host.
- **I:** No server-side API version or migration policy is visible. Integration should pin/test against this deployed source and installed Codex version, then recheck after upgrades.

## Inspection references

- Proxy implementation: [`server.js`](/home/vlad/apps/codex-webui/server.js), especially authentication (lines 19–158), bridge/SSE (311–454), routes (474–805), and error handling (849–877).
- Browser behavior: [`public/app.js`](/home/vlad/apps/codex-webui/public/app.js), especially request helper (27–37), thread reads and resync (1476–1520, 1909–2051), send path (2154–2320), events (2335–2535), and initialization (2539–2606).
- Archive batch result: [`archive-batch.js`](/home/vlad/apps/codex-webui/archive-batch.js). Deployment intent and security notes: [`README.md`](/home/vlad/apps/codex-webui/README.md).
- App-server schema: generated with installed `codex-cli 0.160.1` to `/tmp/codex-webui-contract-schema`; this temporary output is not part of the project.
