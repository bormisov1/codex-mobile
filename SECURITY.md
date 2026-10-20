# Local data and PIN security

## Current behavior (20 October 2026)

Modex does **not** ask for an app PIN. It does **not** encrypt its local app state with a PIN. Do not assume that entering a device PIN to unlock the phone locks Modex again after the phone is unlocked.

| Data | Current location and protection |
| --- | --- |
| WebUI password, optional HTTP Basic Auth credentials, server origin | `expo-secure-store`: iOS Keychain with `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`; Android uses Keystore-backed storage. The app reads these without a separate app-authentication prompt. |
| Server-issued `codex_webui_session` | Native cookie store. The app can read it through the cookie manager and also holds it in memory. `HttpOnly` limits browser JavaScript access; it is not app PIN encryption. |
| Preferences, system prompts, per-thread drafts, queued messages, rate-limit retry text and attachment references, thread/workspace IDs | `codex-mobile-state-v1` in unencrypted AsyncStorage. Some of this is sensitive content, not merely preferences. |
| Recent JavaScript error reports | `modex.diagnostics.v1` in unencrypted AsyncStorage. Messages and stacks can include private data. |
| Downloaded gallery files and exported Markdown conversations | Plain files in the app cache. Copies handed to the operating system's share sheet or another app are outside Modex's control. |
| Conversation threads, turns, uploaded attachments | Codex WebUI server, not encrypted by a client-side PIN. The server's own storage, authentication, backups, and transport determine their protection. |
| Browser preview | No saved credentials, but app state uses the browser's AsyncStorage backend and the browser manages session cookies. No app PIN or local encryption. |

Signing out clears the saved passwords. When an API client exists, it also attempts server logout and clears the native session cookie for the current server. It does not erase app state, diagnostics, cached files, server-side history, or copies shared with another app. Device storage encryption and application sandboxing may provide additional operating-system protection, but neither is a Modex PIN feature.

## Design required before offering a PIN/lock feature

1. Decide the unlock promise explicitly: a separate Modex PIN, operating-system device PIN/biometric authentication, or both. A short standalone PIN cannot adequately resist offline guessing if an attacker copies an encrypted database. A visual prompt alone does not protect copied files or the native cookie.
2. Use a reviewed crypto implementation to generate a random 256-bit data key and AES-256-GCM encryption with fresh random nonces and authenticated format/version metadata. Protect the data key through iOS Keychain/Android Keystore with user authentication. If a separate Modex PIN is required, combine it with a device-bound secret through a reviewed, memory-hard KDF (such as Argon2id), store a random salt and versioned KDF parameters, and test performance on supported devices. Never store the PIN, a plaintext data key, or a fast hash of the PIN. Specify whether device loss, biometric changes, and forgotten PIN allow recovery; do not silently reset data.
3. Encrypt every local state item that can contain private content, including diagnostics and any cache that must persist. Stop requests and streaming when locked; clear in-memory thread text, credentials, authorization headers, and cached cookie values. Clear the native cookie on lock or replace it with a server-side session mechanism whose validity is gated by unlock. A JavaScript background callback alone cannot guarantee cookie removal before suspension, so test native lifecycle behavior. Suppress sensitive app-switcher snapshots and notifications as needed.
4. Migrate without data loss: write a versioned encrypted copy, read it back and authenticate it, then switch readers. Delete the old AsyncStorage keys only after verification. Handle crashes and storage failures by retaining recoverable data and showing a clear error. Deletion from SQLite/cache cannot guarantee removal from old backups or storage pages; disclose that limit.
5. Test real iOS and Android builds: cold launch, background/foreground, app termination during migration, wrong PIN, PIN change, device passcode/biometric changes, offline mode, cookie restoration, cached files, and browser preview. Use an independent security review before describing local content as PIN-encrypted.

The current Expo SDK provides AES-GCM primitives, but its documented crypto API does not include a PIN KDF. Adding a prompt without the complete data, cookie, and migration work above would overstate its protection.

References: [Expo SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Expo Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/), and [AsyncStorage](https://react-native-async-storage.github.io/).
