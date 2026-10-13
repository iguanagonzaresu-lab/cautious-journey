# Mobile Release Preflight — illustrative fixture

This is a synthetic example, not a real app or store approval.

Platform: Android / iOS  
Target: production  
STATUS: BLOCK (BLOCKED)  
Production readiness: NOT_VERIFIED

## Blocker: Android build identifier

Evidence: The literal versionCode is 41; the user-confirmed previous store release for the same application is also 41.

Risk: Reusing this build identifier may prevent uploading an update.

Fix: Review the actual store record and select the appropriate next identifier.

Verify: Compare the final release artifact with the store history. The scanner does not build that artifact.

## Warning: permission addition

Evidence: One new permission entry is present in the selected app's changed Expo configuration.

Risk: Consent behavior and store privacy declarations may need changes; this does not prove they are wrong.

Fix: Review the capability with the release owner.

Verify: Inspect resolved manifests and test consent flows on a device.

## Warning: missing regression evidence

Evidence: No executed or matching attested test results were supplied.

Risk: Regression coverage is not established.

Fix: Run the reviewed tests in an authorized environment or supply a truthful revision-bound attestation.

Verify: Re-run against the final candidate.

## Recommendation

NO-GO: resolve the blocker and review evidence gaps. Signing, artifacts, store policy and runtime behavior still require independent verification. No app was built or published.
