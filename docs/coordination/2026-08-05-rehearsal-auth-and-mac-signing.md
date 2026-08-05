# Rehearsal authentication and Mac signing boundary

Date: 2026-08-05

Status: implemented and verified locally; first guest Google sign-in and physical
capture remain human-operated evidence gates

## Decision

Guest sign-in readiness describes only whether a pre-created active Quipsly user
can safely bind the first verified Firebase/Google identity for the invited
email. It does not depend on manuscript, room, consent, media, or other episode
staging repairs. Those remain separate rehearsal-plan and preflight states.

The canonical Quipsly Studio Mac build must be Apple Development signed with the
expected Team identifier and the data-protection Keychain access group
`585GUXMY5M.com.highground.QuipslyMac`. A bundle without that entitlement is not
trusted for saved native-account continuity even when its bundle identifier and
process path look correct.

## Verification

- The source project specification and generated Xcode project both select the
  Mac entitlements file in Debug and Release.
- The canonical build script rejects a signed bundle whose first Keychain access
  group is missing or differs from the expected Team plus bundle identifier.
- A rebuilt canonical bundle passed signature, Team, entitlement, and native
  account-agent readback; the agent reported
  `dataProtectionKeychainEntitled=true` without exposing credentials.
- Rehearsal-plan readback now reports Scott's pre-created account as
  `AWAITING_FIRST_VERIFIED_GOOGLE_SIGN_IN`, with Firebase as the identity
  authority and no verification-email step. A missing Episode manuscript
  document remains visible independently as `ensureDocument=true`.
- Focused rehearsal preparation/preflight tests pass 16 of 16.

## Open proof

- Scott must complete the first Google sign-in with the exact invited Google
  mailbox so Firebase can prove and bind that identity.
- Re-run production preflight after the matching Nest source is deployed.
- Select and verify the physical MV7i route, verify the camera signal, and run a
  real browser plus iPhone Session capture before calling the rehearsal ready.

