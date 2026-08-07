# Browser Episode edit + local execution · 2026-08-07

## Outcome

The Episode collaboration space is now the primary editing surface and the Mac is an observed execution worker, not a second editor. A collaborator can freeze the current shared branch at the playhead, ask this Mac for an exact-source ten-second proof, and watch the independently verified result in the same browser workspace without cloud rendering.

This is the first operated hybrid slice of the intended product architecture:

- browser: shared decisions, transcript/audio inspection, collaboration, preview playback, and executor visibility;
- local worker: source-heavy decode and render when an authorized Mac has the bytes;
- cloud worker: a future optional executor for shared availability, burst capacity, and final delivery—not the owner of edit intent;
- canonical data: the protected Episode source projection plus the revisioned shared edit branch.

## Cost and UX contract

Browser editing does not imply server-side rendering. The edit branch is small state. Protected media may be played through registered proxies, while compute-heavy work is dispatched only when a user asks for it or a future policy explicitly allows it.

The UI reports observed capability:

- `this Mac online` only appears after a current `AgentNode` heartbeat advertises the exact proof job and render profile;
- an absent or stale heartbeat leaves browser editing usable and disables the local proof action;
- queued, processing, output-ready, failed, and completed work remains visible in the Episode workspace;
- the highest edit revision owns the proof player, even if an older row received a later maintenance timestamp.

## Frozen manifest

`quipsly-episode-render-proof-job-v1` binds:

- project, Episode production, branch, and exact branch revision;
- timeline, source projection, and edit-state fingerprints;
- proof start/end and the exact program decision;
- every selected lane's durable media/source identity, SHA-256, byte count, source clock, and local locator;
- a fixed 1280x720, 24 fps, H.264/AAC proof target;
- explicit boundaries that source media stays immutable and the proof is neither approved output nor publication media.

The local worker rechecks every source before and after rendering, writes atomically under the dedicated media vault, fully decodes the output, and returns a byte receipt. The server independently checks the output path, size, SHA-256, and complete decode before registering protected playback.

## Retained operation

Operated against `high-ground-odyssey-manuscript / capture-sync-rendezvous-qa-20260805`:

- saved a real `Charlie + Clip` branch decision through the browser;
- froze revision 3 over Episode clock `00:00:00:00 -> 00:00:10:00`;
- bound one receipt-matching camera proxy plus two exact audio sources;
- rendered and registered 1280x720 H.264 + AAC at 24 fps on the local Mac;
- loaded the registered media in the browser at duration 10 seconds and advanced playback past one second;
- visually confirmed the camera frame in the Episode proof player;
- repeated the render after restarting the corrected worker and observed a current UTC job timestamp plus automatic registration.
- confirmed the newest proof receipt and the live capability heartbeat carry the same execution ID and build ID.

The retained branch decisions and proof artifacts are intentional dogfood evidence. They do not change source bytes, approve a master, or start publication.

## Integration defects found by doing the work

1. Raw PostgreSQL heartbeats wrote Mountain time into UTC-owned timestamp columns. Database-owned UTC timestamps now drive presence and leases.
2. The Clips monitor accepted projected `reference` cameras while decision resolution only accepted literal `clip` sources. Both now use the same source-role contract.
3. A legacy imported camera referenced an incomplete placeholder asset while its protected source URL had the complete measured proxy asset. Planning now reconciles them by protected source URL and exact on-disk byte count, then still relies on SHA-256 verification.
4. Worker job timestamps had the same raw-SQL timezone defect. Proof claim, completion, retry, and failure timestamps are now database-owned UTC.
5. The player chose the first timestamp-sorted proof. It now prioritizes the highest branch revision.

Each defect previously produced an honest hold or an obviously black audio-only proof. None was papered over with guessed identity.

## Next execution slices

1. Add executor choice and policy (`this Mac`, another collaborator device, or cloud) while keeping one manifest and result contract.
2. Add low-cost proxy/background upload policy so collaborators can edit immediately and move rendering between executors without copying edit state.
3. Extend the manifest from a ten-second proof to range, draft, and final-delivery profiles with explicit quality/cost estimates.
4. Add revision compare/revert and anchored review comments directly beside proof playback.
5. Make audio routing and mastery previews first-class render lanes; never hide which source, treatment, or receipt produced what the listener hears.
