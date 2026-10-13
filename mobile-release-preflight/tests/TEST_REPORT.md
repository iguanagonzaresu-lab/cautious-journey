# v0.1 validation record

Date: 2026-10-13  
Environment: Windows, Node.js v24.21.0, local Git.  
Scope: new `mobile-release-preflight` only; synthetic applications in temporary directories.

## Executed

- `node --test tests/preflight.test.js`: **48 passed, 0 failed, 0 skipped** (approximately 29 seconds).
- Repeated via `preflight-regression --run test` in an isolated copy: **exit 0 / PASS** (approximately 27 seconds).
- Skill Creator `quick_validate.py`: **Skill is valid!**
- Agent interface YAML parse and default-prompt presence: **PASS**.

## Covered behavior

Normal scoped PASS; invalid Android and iOS versions; confirmed build increments; malformed JSON; native precedence; dynamic config not executed; EAS remotely managed versions; permissions; explicit bases; staged/untracked/deleted files; nested application paths; test attestations (identity, age, platform, target, dirty state and failures); missing Git; secret-value suppression; conflict markers; size limits; external junction exclusion; default no test execution; approved test success/failure; lifecycle-hook suppression; timeout; output limits; source mutation; CLI exit codes.

## Preflight result for the new Skill

**WARN**, no BLOCK findings. Compared an empty temporary baseline with the new package, not the user's unrelated working-tree changes. Deploy and Content packs selected.

- `.gitignore` was not classified by the generic scanner. Manually reviewed: excludes only generated dependency, validation, coverage and log/report paths.
- Content evidence warning: the generic scanner only checks basic local references. README and reference instructions were manually reviewed for actual scope, exit codes, dates and safety boundaries. Browser rendering and a fresh full external-link crawl were not performed.

## Not claimed

- No live app, store account, signing credential, real production build or authenticated CI was tested.
- No macOS/Xcode or Linux runtime validation was performed.
- Static parsing and credential detection are deliberately bounded, not complete platform validation or secret auditing.
- Synthetic fixtures do not establish real-world false-positive/false-negative rates.
- GitHub publication and skills.sh availability were not tested or performed.
