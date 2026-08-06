# Unified audible-event analysis ledger

Date: 2026-08-06

Status: implemented and operated locally across podcast and coaching sources

## Outcome

Audible-event analysis is no longer owned by an Episode JSON projection. The
canonical object is now `StudioAudibleEventAnalysisReceipt`, an append-only
receipt bound to one Nest, original media asset, original source, immutable
source hash/generation/byte count, detector configuration, and completed
analysis payload. Podcast Episodes and coaching Sessions project the same
evidence into their own workflow surfaces.

The private qualification lab is also one reusable component. Audio Studio,
Dialogue Repair, and a coaching Session all use the same protected playback,
classifier-suggestion, independent ground-truth, supersession, and complete
source-clock listening gates. A Session can surface an analyzed older source
even when its newest transcript attempt is held; transcript recency no longer
hides valid source evidence.

## Why the prior ownership was wrong

The first detector pass stored its completed receipt inside
`StudioEpisodeProduction.productionJson`. That was a useful projection for an
Episode but not a legitimate canonical home:

- coaching audio has no Episode production;
- a newer transcript attempt could hide an older analyzed source;
- review and corpus code had to know Episode JSON topology;
- the same detector could not be reused without copying evidence; and
- integrity validation depended on a presentation document rather than the
  exact media source.

The Episode JSON copy remains a migration fallback and compatibility
projection. New reads prefer the ledger. An invalid canonical row fails the
entire source projection instead of silently falling back to attractive but
stale JSON.

## Canonical contract

Every ledger row preserves:

- one analysis ID and optional superseded analysis ID;
- exact project, original asset, and original source coordinates;
- source SHA-256, generation, byte count, and measured duration;
- algorithm, classifier identity, and detector-configuration hash;
- a stable registration-envelope hash;
- the complete parsed detector receipt and analyzed timestamp; and
- no authority to label truth, repair audio, edit a timeline, promote a
  derivative, or publish.

Registration is staff-only, exact-source authorized, append-only,
idempotency-checked, serialized with an advisory lock, and re-inspects the
immutable source inside the transaction before persistence. Review and corpus
receipts remain separate ledgers; classifier output is listening priority, not
human truth.

## Retained operation

Two real native Apple analysis paths were executed against retained local
sources:

| Workload | Exact source | Result | Canonical analysis |
| --- | --- | --- | --- |
| Coaching | 80-second retained continuity WAV | `keyboard_musical` and `music`, 59.25–60.75 seconds | `audible_analysis_835a4bcd2fac451a93fb50067d7ea213` |
| Podcast | High Ground Odyssey Episode 4 Part 2, 8-second source | `beep`, 0–7.5 seconds | `audible_analysis_7ab948331edd40219bf01e7eccf2e9e4` |

The coaching source is synthetic. These suggestions prove execution,
registration, projection, and playback—not classifier accuracy or audibility.
No human label or review decision was fabricated.

The retained coach then opened the real coaching Session in Chrome, expanded
**Qualify what the detector surfaced**, saw both suggestions, and played the
complete protected 58.25–61.75 second context. The UI reached **Complete window
observed**. Persistence correctly remained disabled because no listening note
was supplied.

## Defect found by operation

The first retained registrations failed the ledger's registration-envelope
hash even though the bytes matched. Two independent normalization differences
were responsible:

1. the scripts hashed macOS's `/var/...` spelling while the server used the
   symlink-safe canonical `/private/var/...` path; and
2. the native JSON omitted successful `failureCode` and `failureDetail` keys,
   while the server parser canonicalized both to `null` before hashing.

Both retained scripts now realpath the authorized source and canonicalize the
parsed receipt envelope before persistence. The four invalid local-only test
rows produced during diagnosis had no review dependents, were removed by exact
ID, and were replaced by the two valid rows above. Original media bytes and
human evidence were untouched.

This was not loosened to a byte-hash-only comparison. Path canonicalization is
part of the local security boundary because an allowed-folder symlink must not
become an arbitrary-file read.

## Verification

- Prisma schema formatted and client generated.
- Migration `20260806050000_add_audible_event_analysis_ledger` applied locally.
- Focused web/server/API suites: 72 tests passed.
- Retained operation contract: 2 Node tests passed.
- Coaching and podcast registrations completed against native Apple framework
  output.
- Coaching Session loaded through the real Firebase test identity and protected
  source endpoint.
- Complete bounded playback was operated; no label was saved.

## Next gates

1. Collect genuine, consented podcast and coaching positive/absent windows.
2. Measure precision, recall, false positives per labeled hour, boundary error,
   reviewer effort, and separate workload coverage.
3. Run short and long physical-iPhone performance, battery, thermal, route,
   interruption, and recovery trials.
4. Compare Apple output with candidate custom or server-side detectors without
   changing the canonical source clock or review model.
5. Promote a detector to default listening triage only after the retained gate
   passes; never let the gate authorize treatment or editing.
