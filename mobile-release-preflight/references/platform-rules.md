# Static platform rules and limitations

Consult only for platform checks selected by the entry skill. Official references checked on 2026-10-13. Recheck mutable store policies for each real release; this file is not a permanent policy registry.

## Android

- Read a unique `android/app/build.gradle[.kts]` or `app/build.gradle[.kts]` before Expo values. Support literal `applicationId`, `versionName`, and `versionCode` only; do not execute Gradle or evaluate expressions.
- Multiple files, product flavors and application/version suffixes require resolved variant evidence. Unknown is WARN, not a guessed value.
- Check a positive integral versionCode with the documented Play maximum of 2100000000. Confirm against current policy if the platform changes this limit.
- `versionName` is a nonempty display string, not necessarily semver.
- An application ID needs multiple dot-separated segments; each starts with a letter and contains letters, digits or underscores.
- Compare build number increases only against a user-confirmed published release of the same application. Git HEAD is not a store history record.
- Permission diffs cover literal source `uses-permission` / `uses-permission-sdk-*` and Expo permission entries only. Transitive library permissions and merged manifests need independent checks.

Sources:

- https://developer.android.com/studio/publish/versioning
- https://developer.android.com/build/configure-app-module

## iOS

- Prefer a unique native `Info.plist` over Expo. Exclude obvious test/Pods/Frameworks paths. Multiple candidates, generated plists and build-setting substitutions require human review.
- XML extraction recognizes simple string/integer key values; no entity expansion, binary-plist decoding or Xcode evaluation. This is not a full XML validator. Validate the selected target and final artifact with native tooling independently.
- `CFBundleShortVersionString`: three period-separated numeric components.
- `CFBundleVersion`: one to three period-separated digit components, compared numerically, not lexicographically. Current Apple documentation permits zero. Do not silently substitute older archived restrictions.
- Bundle identifier is checked for dot-separated alphanumeric/hyphen segments; format checks do not validate App Store ownership or provisioning.
- Build increment is compared within the same marketing-version train only. A marketing-version change requires store-history review rather than assuming build numbers must globally increase.
- New `NS*UsageDescription` keys imply a disclosure/consent review, not proof of a policy violation. Entitlements, privacy manifests, capabilities and actual usage are not fully evaluated.

Sources:

- https://developer.apple.com/documentation/BundleResources/Information-Property-List/CFBundleVersion
- https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring

## Expo / React Native

- Static `app.config.json` takes precedence over `app.json`. If a top-level `expo` object exists, use it.
- Never execute `app.config.js`, `.ts`, `.mjs`, `.cjs`, `.mts` or `.cts`. Presence means resolved config is required. Do not invoke `npx expo config`: it can execute project code/plugins.
- When a recognized native app config exists, its literal values take precedence over managed JSON. Native values still need resolved variant/target confirmation.
- `cli.appVersionSource: remote`, auto-increment and inherited build profiles mean local numbers may not describe the final build. v0.1 conservatively flags these if present in any profile; it does not fully resolve EAS profiles.
- Config plugins and prebuild can change capabilities. Inspect resolved production artifacts separately; the scanner never runs prebuild.

Sources:

- https://docs.expo.dev/workflow/configuration/
- https://docs.expo.dev/build-reference/app-versions/

## Decision rules

- BLOCK: confirmed literal format violation, non-increment against confirmed same-app release, failed accepted tests, high-risk credential-shaped content or conflict markers requiring resolution.
- WARN: unknown/generated config, new permissions, risky paths, missing/stale/wrong-scope evidence, partial scan, absent baseline or unsupported project.
- PASS: a specific check has adequate evidence within its stated scope.
- PASS/WARN/BLOCK do not authenticate attested results, verify store policy, or authorize publishing. Every report explicitly leaves production readiness NOT_VERIFIED.
- No arbitrary numeric risk score, probability or claimed test coverage.
