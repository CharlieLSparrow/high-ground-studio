# Browser Episode edit + local execution · 2026-08-07

## Outcome

The Episode collaboration space is now the primary editing surface and the Mac is an observed execution worker, not a second editor. A collaborator can inspect side-effect-free render options, freeze the current shared branch at the playhead, ask this Mac for an exact-source fast proof or section review, and watch the independently verified result in the same browser workspace without cloud rendering.

This is the first operated hybrid slice of the intended product architecture:

- browser: shared decisions, transcript/audio inspection, collaboration, preview playback, and executor visibility;
- local worker: source-heavy decode and render when an authorized Mac has the bytes;
- cloud worker: a future optional executor for shared availability, burst capacity, and final delivery—not the owner of edit intent;
- canonical data: the protected Episode source projection plus the revisioned shared edit branch.

## Cost and UX contract

Browser editing does not imply server-side rendering. The edit branch is small state. Protected media may be played through registered proxies, while compute-heavy work is dispatched only when a user asks for it or a future policy explicitly allows it.

The UI reports observed capability:

- `Mac observed` only appears after a current `AgentNode` heartbeat advertises the exact job plus the selected render profile;
- opening Render options creates no workflow job, writes no media, starts no cloud upload, and starts no publication;
- browser preview, this Mac, and Quipsly Cloud are shown as separate executor cards with quality, readiness, and cost consequences;
- an absent or stale heartbeat leaves browser editing usable and holds only the local render action;
- Quipsly Cloud is explicitly `not configured` until frozen exact-source upload, generation locking, independent result verification, and spend disclosure exist end to end;
- queued, processing, output-ready, failed, and completed work remains visible in the Episode workspace;
- the highest edit revision owns the proof player, even if an older row received a later maintenance timestamp.

## Product precedent

The hybrid contract follows the useful parts of mature online editors without copying their hidden boundaries:

- [Riverside exposes per-participant high-quality upload progress](https://support.riverside.fm/hc/en-us/articles/5287442440093-Confirm-that-participants-tracks-are-uploading) and retains a [lower-quality cloud recording as backup/reference](https://support.riverside.fm/hc/en-us/articles/5260156003485-About-cloud-recording-files) while local tracks arrive.
- Descript exposes [import/upload activity](https://help.descript.com/hc/en-us/articles/10119645307789-Import-and-upload-files-into-Descript), [syncs work while editing](https://help.descript.com/hc/en-us/articles/13520561812237-Save-your-work-to-the-cloud), keeps [original plus optimized copies](https://help.descript.com/hc/en-us/articles/10164166215309-Project-file-management), and uses [originals for final export](https://help.descript.com/hc/en-us/articles/34610427613325-Why-Is-My-Import-or-Upload-Taking-So-Long) even when optimized media drives the editing experience.
- Premiere's proxy workflow permits [continued work during background proxy generation](https://helpx.adobe.com/uk/premiere/desktop/organize-media/ingest-proxy-workflow/create-proxies.html) and [exports from originals](https://helpx.adobe.com/premiere/desktop/organize-media/ingest-proxy-workflow/export-proxies.html) unless the editor explicitly chooses proxies.

Quipsly's additional requirement is explicit executor and cost visibility. “Browser editing” must never imply that original media was uploaded or cloud rendering was started.

## Frozen manifest

`quipsly-episode-render-proof-job-v1` binds:

- project, Episode production, branch, and exact branch revision;
- timeline, source projection, and edit-state fingerprints;
- render profile, proof start/end, and the exact program decision;
- every selected lane's durable media/source identity, SHA-256, byte count, source clock, and local locator;
- a fixed 1280x720, 24 fps, H.264/AAC proof target;
- explicit boundaries that source media stays immutable and the proof is neither approved output nor publication media.

Two production contracts currently share this manifest and receipt path:

- `proof-10s`: up to 10 seconds, `episode-edit-proof`, optimized for rapid cut/picture/sound checks;
- `section-review-30s`: up to 30 seconds, `episode-section-review`, stopping at the next cut decision.

Both are 1280x720 H.264/AAC at 24 fps and both remain unapproved review artifacts. Longer drafts and final delivery must get separate profiles rather than silently stretching these limits.

The local worker rechecks every source before and after rendering, writes atomically under the dedicated media vault, fully decodes the output, and returns a byte receipt. The server independently checks the output path, size, SHA-256, and complete decode before registering protected playback.

## Retained operation

Operated against `high-ground-odyssey-manuscript / capture-sync-rendezvous-qa-20260805`:

- saved a real `Charlie + Clip` branch decision through the browser;
- froze revision 3 over Episode clock `00:00:00:00 -> 00:00:10:00`;
- opened the side-effect-free render plan and observed three exact sources totaling 26.1 MB, browser preview ready, this Mac ready, and Quipsly Cloud explicitly not configured;
- bound one receipt-matching camera proxy plus two exact audio sources;
- rendered and registered 1280x720 H.264 + AAC at 24 fps on the local Mac;
- loaded the registered media in the browser at duration 10 seconds and advanced playback past one second;
- visually confirmed the camera frame in the Episode proof player;
- repeated the render after restarting the corrected worker and observed a current UTC job timestamp plus automatic registration.
- froze and rendered the explicit `section-review-30s` profile at revision 3, then verified the 30-second result, matching target/result variant, current worker receipt, and browser playback readiness;
- confirmed the newest proof receipt and the live capability heartbeat carry the same execution ID and build ID.

The retained branch decisions and proof artifacts are intentional dogfood evidence. They do not change source bytes, approve a master, or start publication.

## Integration defects found by doing the work

1. Raw PostgreSQL heartbeats wrote Mountain time into UTC-owned timestamp columns. Database-owned UTC timestamps now drive presence and leases.
2. The Clips monitor accepted projected `reference` cameras while decision resolution only accepted literal `clip` sources. Both now use the same source-role contract.
3. A legacy imported camera referenced an incomplete placeholder asset while its protected source URL had the complete measured proxy asset. Planning now reconciles them by protected source URL and exact on-disk byte count, then still relies on SHA-256 verification.
4. Worker job timestamps had the same raw-SQL timezone defect. Proof claim, completion, retry, and failure timestamps are now database-owned UTC.
5. The player chose the first timestamp-sorted proof. It now prioritizes the highest branch revision.
6. The local worker receipt hardcoded the original fast-proof variant. A section-review render therefore failed shared result validation and safely retried without registering a bad artifact. The receipt now uses the frozen target variant, with contract coverage for both profiles and the 30-second boundary.

Each defect previously produced an honest hold or an obviously black audio-only proof. None was papered over with guessed identity.

## Next execution slices

1. Extend executor choice from observed `this Mac` to another collaborator device and cloud while keeping one manifest/result authority.
2. Add visible low-cost proxy/background upload policy so collaborators can edit immediately and move rendering between executors without copying edit state.
3. Extend render profiles from fast proof and section review to named range, draft, and final-delivery contracts with preflight size/time/spend estimates.
4. Add revision compare/revert and anchored review comments directly beside proof playback.
5. Make audio routing and mastery previews first-class render lanes; never hide which source, treatment, or receipt produced what the listener hears.
