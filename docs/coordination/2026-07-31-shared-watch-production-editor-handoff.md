# Shared Watch production-editor handoff

Date: 2026-07-31 MDT

## Exact source

- Implementation commit: `5ebda1e19a5a6c3fb6dfa69d19e9cbe859d64dc6`
- Branch: `codex/quipsly-product-20260724`
- Retained local Nest: `home-quipsly-media-ms8ct81g-at-example-test`
- Retained episode: `current-episode`
- Canonical derivative:
  `episode-room-watch-6ca3a967-1d03-4aea-b06e-a20de704a27f`

## Product boundary repaired

Episode Room already kept its revisioned playback ledger, clips, watch
segments, command receipts, and deterministic timeline derivatives in the
canonical `StudioEpisodeProduction.productionJson` aggregate. The Nest episode
editor rendered those derivatives, but the full `/editor` surface hydrated only
`timelineJson`, `recordingRoomJson`, and `transcriptJson`. A valid Shared Watch
pass could therefore be saved and visible in one editor while appearing empty
in the production editor.

The production editor now treats Shared Watch as a receipt-backed projection:

- only `quipsly-episode-room-watch.v1` rows with complete session, segment,
  start-receipt, end-receipt, clock, media, and source-range evidence qualify;
- the current projection replaces stale materializations by stable identity;
- ordinary timeline clips, transcript blocks, and paper-edit state remain
  intact;
- an authoritative empty sync removes only prior Shared Watch materializations;
- the protected recording and imported media remain untouched;
- subsequent editor saves preserve `generatedFrom` and the complete
  `recordingSync` receipt envelope; and
- optimistic concurrency still compares against the pre-projection saved
  timeline fingerprint, avoiding a false conflict on the first save.

The production-truth panel now reports the count of receipt-backed Shared Watch
spans instead of making the user infer whether Watch reached the editor.

## Operated retained acceptance

The exact committed source was exercised through the rendered local product as
the Keychain-backed retained `.test` media operator. The journey:

1. signed in through the real login form;
2. reopened the retained recorder episode and verified its exact manuscript,
   clip cue, `00:02-00:18` played-source event, and honest recording-room editor
   hydration;
3. opened the retained Media Vault/Shared Watch episode in the full production
   editor;
4. rendered exactly one `Watched · Canonical tag focus QA` derivative at the
   retained `00:04-00:12` source range;
5. displayed `1 receipt-backed` in production truth;
6. injected no placeholder media, raised no browser exception, and produced no
   external effect; and
7. cleared the rendered browser session while retaining the QA corpus.

The repeated run was intentionally idempotent and reported
`mutationsPerformed: false` because the retained evidence was already current.

Independent PostgreSQL readback found exactly one derivative, the exact
`quipsly-episode-room-watch.v1` source, stable derivative ID, start receipt
`238bf1a8-ef68-422f-9952-19ba263a1ef2`, and end receipt
`ab69b752-2232-49f4-b74d-b994ba3b6633`. `timelineJson` remained null, proving
that opening the editor did not rewrite the protected source aggregate.

## Qualification

- Focused projection and rendered editor tests: 12/12.
- Complete active Quipsly Jest: 195 suites / 986 tests.
- Cross-surface release contracts: 180/180.
- Quipsly TypeScript check: passed.
- Optimized Next.js 16.2.7 build: 150/150 routes.
- Retained recorder/editor/Shared Watch operation: passed.
- Independent database readback: passed.

## Production release

- Exact deployed source: `7cad51fed83189582545731deeb2541bb6852fdf`
- Cloud Build: `b09b93e2-e735-44fa-8465-974d827fc09a`
- Cloud Run revision: `studio-00484-jem`
- Build manifest-list digest:
  `sha256:d77371bb0e768f9273fb860ace6c0750d6688b459af64ddaa3e92706c08fe99f`
- Cloud Run platform image digest:
  `sha256:2a568b14bbb2b3991af9619e59bdd95392eae06f140128790c7f374917d61dd5`
- Rollback revision: `studio-00482-lon`
- Production traffic: `100% studio-00484-jem`

The release pipeline materialized a dependency-closed clean context from the
exact commit, passed 30/30 Session source-evidence tests, regenerated Prisma,
built and typechecked all 150 routes again, verified six required route bundles
inside the final image, and deployed the candidate with zero traffic. A
generated verified reviewer then exercised public health, production-core,
Firebase, native-session, Home Nest, Projects, Session workspace, account
switching, admin authority, writing, editor, recorder, Research, Publishing,
logout, and configured public hosts before promotion.

After smoke, the reviewer removed two grants, one membership, one generated
user, one Home Nest, and the Firebase identity, then independently verified
both stores clean. The immutable candidate was promoted to 100% traffic.
Production `/api/healthz` reads back the exact source, image tag, and revision;
the post-promotion recovery gate passes infrastructure, domain/certificate,
public-route, billing-log, and all 111 Capture contracts.

## Remaining boundary

This checkpoint proves the production web handoff. It does not claim a
physical TestFlight recording. Physical-iPhone install, audio/video capture,
camera switching, pause/resume, interruption recovery, upload, playback,
alignment, and same-ID Nest/Studio readback remain open until an iPhone
enumerates through CoreDevice. Quipsly Capture Build 24 remains the canonical
public TestFlight target.
