# Build and release flow

This project follows the same long-lived branch pattern as `chinese-learn`: work on `feat/*`, open a pull request into `dev`, and promote `dev` to `master` with a separate pull request. The [`verify-mobile.yml`](.github/workflows/verify-mobile.yml) workflow checks every PR into `dev`; [`release-mobile.yml`](.github/workflows/release-mobile.yml) builds and submits both platforms when `master` changes after `MOBILE_RELEASE_READY=true` is configured. Do not merge a feature branch directly into `master`.

## First-time setup

1. Create a private GitHub repository, add it as `origin`, and push `master` and `dev`; the release jobs stay skipped until the repository variable `MOBILE_RELEASE_READY` is set to `true`.
2. Set unique iOS bundle and Android package IDs in `app.json` before creating store entries, and create the corresponding apps in App Store Connect and Google Play Console.
3. Run `npx eas-cli@latest init` to link the Expo app and commit the generated `extra.eas.projectId` in `app.json`.
4. Run `npx eas-cli@latest credentials --platform ios` and `npx eas-cli@latest credentials --platform android` to configure signing; set up the App Store Connect API key and Google Play service account for EAS Submit.
5. Set `submit.production.ios.ascAppId` in `eas.json` to the numeric App Store Connect app ID, and add `EXPO_TOKEN` to GitHub Actions secrets.
6. Make one successful local EAS production build for each platform to verify the Expo project, credentials, and store IDs, then set the GitHub Actions variable `MOBILE_RELEASE_READY=true` to enable release jobs on later `master` pushes or manual dispatch.

The release workflow uses EAS cloud builds, so GitHub runners do not need Apple signing files or Android keystores. EAS keeps signing and submission credentials in the connected Expo account; never commit them. iOS uploads to TestFlight and Android uploads to the Play internal track. Store review and tester access remain managed in the respective store consoles.

## Daily flow

```sh
git checkout dev
git pull --ff-only origin dev
git checkout -b feat/my-change
npm ci --include=dev
npm run typecheck
npm test
```

Open `feat/my-change -> dev`, wait for JS checks and both native compile jobs, then merge. When ready to distribute, open `dev -> master`; merging triggers EAS production builds and submissions. The release workflow also supports manual dispatch.

For local development use `npm run start`; `npm run android` needs a local Android SDK, and `npm run ios` needs macOS with Xcode, so this Linux workstation relies on the macOS CI job or EAS for iOS binaries. A physical phone must reach the same trusted Codex WebUI server that currently listens on this computer's `127.0.0.1:4545`; configure that address in the app before signing in. Do not expose this full-machine Codex server directly to the public internet. A private network route such as Tailscale is appropriate; see [CONNECT_TO_SERVER.md](CONNECT_TO_SERVER.md).

## Reference

- [Expo EAS Build from GitHub](https://docs.expo.dev/build/building-from-github/)
- [Expo EAS Submit configuration](https://docs.expo.dev/submit/eas-json/)
- [Expo Android submission](https://docs.expo.dev/submit/android/)
