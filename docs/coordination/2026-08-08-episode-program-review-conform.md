# Episode full-program review conform — 2026-08-08

## Outcome

Advanced Studio can now plan and queue one complete, watchable Play Edit from
the authenticated canonical Episode revision. The browser remains the editing
surface; a named Mac that owns every exact source generation is the render
executor. The resulting 1280x720/24 fps H.264/AAC MP4 is a review candidate,
not an approved master or publication asset.

This closes the dead end where Advanced Studio could make timeline decisions
but only request a short proof. It does not collapse review, approval, master
promotion, and publication into one risky action.

## Frozen contract

`quipsly-episode-program-render-job-v1` freezes:

- project, Episode, edit branch, branch revision, edit-state fingerprint, and
  timeline/source projection fingerprints;
- every exact input generation, SHA-256, byte count, sequence offset, and
  executor-local custody authority;
- ordered visible program chunks on both the Episode clock and the compressed
  output clock;
- explicit skipped duration rather than silently removing uncovered time;
- one named executor and storage scope;
- an executor-local target locator and fixed 720p/24 review profile; and
- boundaries stating that source bytes remain immutable and approval,
  promotion, upload, and publication are separate operations.

Visible spans are split into chunks no longer than 30 seconds. That gives the
worker bounded retries and observable progress without changing the canonical
edit. Chunks must be contiguous on the output clock, ordered on the Episode
clock, covered by the frozen exact sources, and duration-balanced against the
declared skip total.

## Worker and playback boundary

The local worker:

1. claims only jobs addressed to its node and storage scope;
2. verifies the manifest and every source byte before rendering;
3. renews its durable lease after every completed chunk;
4. assembles chunks with stream copy, applies MP4 fast-start, probes dimensions
   and duration, and decodes the complete output;
5. re-verifies every source after rendering; and
6. emits a generation-locked result receipt without claiming approval.

The server independently validates the result, local output path, checksum,
byte count, manifest, executor authority, duration, and decode receipt before
registering protected playback. Playback authorization fails closed when the
registered artifact has missing or conflicting executor custody.

## UX

Advanced Studio now shows:

- full Play Edit duration and explicit skipped time;
- render chunk count and exact-source byte/count readiness;
- the named Mac and why it can or cannot render;
- a distinct **Check full program** planning action that creates no job; and
- durable chunk progress while the selected Mac renders.

The completed video is labeled **Verified full-program review** and **not an
approved master**. The same dialog retains fast 10-second and 30-second section
proofs for cheap iteration.

## Evidence

- Shared contract and local-worker Node tests: **9 passed**.
- A real FFmpeg integration rendered two noncontiguous source ranges onto one
  contiguous two-second review clock, reported both chunk checkpoints, probed
  1280x720 output, and completed a full decode.
- Web/server/editor focused Jest tests: **42 passed**, including independent
  output verification and protected-playback registration.
- Strict TypeScript passed for the shared media package, media processor, and
  Quipsly web app.
- The media processor production bundle built successfully.
- The cache-disabled Quipsly production build emitted all **194** static pages,
  standalone output, a build identity, and complete server traces.

Docker Desktop was not responsive during this checkpoint, so no retained
database/browser operation is claimed here. The next runtime operation must
use a real canonical Episode whose exact sources are present under a roomy,
durable media root on the selected executor.

## Next boundary

Add an explicit review approval receipt bound to the candidate generation and
canonical branch revision. Only that receipt may authorize a separate master
conform/promotion job. Promotion must select a durable destination, preserve
the review candidate, re-verify full decode and sync, and still must not publish
without another explicit destination action.
