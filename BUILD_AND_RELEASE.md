# Build and release flow

Work on a `feat/*` branch from `dev` and open a pull request into `dev`; merge `dev` into `master` only when the user asks. The [verification workflow](.github/workflows/verify-mobile.yml) compiles the checked-in iOS Xcode project on a GitHub-hosted macOS runner for PRs into `dev`. The [release workflow](.github/workflows/release-mobile.yml) signs and uploads iOS builds to TestFlight with Xcode and altool. iOS CI does not use EAS Build, EAS Submit, or Expo prebuild.

## iOS TestFlight setup

1. The App Store Connect record `Modex AI Workspace` (Apple ID `6824009518`) is registered for `com.prototypebyai.modex` under Apple team `6668YNMX76`. This is a TestFlight upload, not a public App Store release.
2. GitHub Actions repository secrets:
   - `IOS_SIGNING_CERTIFICATE_BASE64`: base64 encoded Apple Distribution `.p12` with its private key.
   - `IOS_SIGNING_CERTIFICATE_PASSWORD`: password for that `.p12`.
   - `IOS_PROVISIONING_PROFILE_BASE64`: base64 encoded App Store provisioning profile for the bundle ID.
   - `ASC_API_KEY_JSON_BASE64`: base64 encoded JSON with `key_id`, `issuer_id`, and `key` containing the downloaded `.p8` private key text.
   All four secrets are configured for this repository.
3. Dispatch **Release Modex Mobile** from the intended branch with `ios_testflight=true`. The job installs CocoaPods, archives with Xcode, exports an IPA, and uploads it using Apple's altool. GitHub-hosted macOS runners consume the private repository's GitHub Actions minutes.
4. Check App Store Connect after Apple's processing finishes, then add internal testers in TestFlight.

Keep certificates, profiles, API keys, and passwords outside the repository. Apple only permits downloading an App Store Connect API private key once. The checked-in `ios/` directory is the source of truth for the native project; when native Expo configuration changes, regenerate it intentionally and review the diff before committing.

After the first TestFlight upload is verified, `MOBILE_IOS_RELEASE_READY=true` may enable uploads on future `master` pushes. Leave it unset while preparing the feature branch. Do not promote `dev` into `master` until asked.

## Android

Android still uses Expo EAS for its release job. Before enabling `MOBILE_ANDROID_RELEASE_READY=true`, choose the final Android package ID, configure Android signing and Google Play internal-track submission in EAS, and add `EXPO_TOKEN` as a GitHub Actions secret. The release workflow builds and submits Android on `master` pushes when the variable is enabled.

## Local development

Use `npm run start` for the development client. `npm run ios` requires macOS with Xcode and CocoaPods; this Linux workstation relies on the macOS CI runner for iOS compile checks. A physical phone must reach the trusted Codex WebUI server, which currently listens on this computer's `127.0.0.1:4545`. Configure a private network route such as Tailscale before signing in; see [CONNECT_TO_SERVER.md](CONNECT_TO_SERVER.md).

## References

- [GitHub: signing Xcode apps on macOS runners](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)
- [Apple: upload builds to App Store Connect](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Apple: upload builds with altool](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
