# Test and previous-release evidence

Read this before creating or accepting an evidence file. Never manufacture success or pretend that an attestation was independently fetched from CI.

## Test attestation (`--evidence`)

Example shape (replace all example values using a real, reviewed run):

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-13T10:00:00Z",
  "commit": "REPLACE_WITH_FULL_CANDIDATE_COMMIT",
  "appPath": ".",
  "target": "production",
  "platforms": ["android", "ios"],
  "tests": {"status": "passed"}
}
```

Use `passed`, `failed` or `skipped`. `failed` blocks when the attestation matches; `skipped` requires review. A mismatched result is an evidence gap, not evidence that the current candidate passed or failed.

Requirements:

1. Full commit equals current HEAD.
2. Application working tree is clean. For monorepos, `appPath` is the Git-root-relative application directory, such as `apps/mobile`, using `/` separators.
3. Target is exactly the selected `production`, `beta` or `internal` environment; the platform list covers the selected platforms.
4. Timestamp is within `--max-age-hours` (default 24, allowed 1–168); allow at most five minutes clock skew into the future.
5. Tests were actually run on that candidate; the producer and coverage are independently reviewed.

Keep evidence outside the app repository, or in an intentionally ignored local evidence directory, so generating it does not make the application dirty. Ignored files can still affect tests; clean Git status is not proof of a hermetic build.

v0.1 checks these fields but does **not** authenticate CI URLs, digital signatures or artifact digests. An explicit user-provided statement is not equivalent to a trusted CI gate. Do not use untrusted pull-request-authored JSON as a production approval.

## Previous store release (`--previous-release`)

```json
{
  "schemaVersion": 1,
  "confirmedReleased": true,
  "platforms": {
    "android": {"id": "org.example.application", "build": 41},
    "ios": {"id": "org.example.application", "version": "1.2.0", "build": "41"}
  }
}
```

Copy from the actual prior store record after checking it; never infer `confirmedReleased` from an arbitrary Git commit. Android build is a JSON integer; iOS build is a string. Only selected platforms need entries.

Missing or mismatched IDs mean the comparison is unresolved. A matching same-app prior Android versionCode must be lower than the candidate. For iOS, only compare within the same marketing version. When the marketing version changes, inspect the correct version train in App Store Connect separately.

## Executing approved tests (`--run-tests`)

Mutually exclusive with `--evidence`. Supports root `npm test` only. Inspect scripts, npm configuration and referenced code first. Running a test is a separate authorization from reading the project; scripts are not sandboxed and may execute arbitrary code.

The runner disables npm lifecycle pre/post hooks, withholds raw output, applies time/output limits and does not install dependencies. Missing runner, timeout, excessive output or candidate mutation yields WARN. A nonzero completed test exit yields BLOCK. A zero exit only proves that this approved command completed successfully, not that tests really cover all release behavior.

Native test suites and remote CI should be run separately by their authorized tooling. Attest their outcome accurately; do not reinterpret missing tests as passed tests.

## Report interpretation

Every finding includes `id`, `status`, `evidence`, `risk`, `fix`, `verify` and optionally a relative `file`. JSON also includes selected scope, commit/base, changed paths, bounded-source fingerprint, counts and limitations. The fingerprint is diagnostic, not a cryptographic attestation of a complete build environment.

Source file paths and Git IDs are included. Never put secrets in filenames, branch labels, or evidence identifiers. Before sharing, review the report even though configuration values and raw test logs are withheld.
