# Live audio input preflight

Date: 2026-08-04
Worktree: `/Users/wall-e/Dev/high-ground-studio-product`
Priority: best-in-market audio transparency before capture

## Outcome

The Nest recorder no longer treats microphone permission as proof that audio is usable. It now keeps separate, visible states for:

1. browser access requested but no stream returned;
2. media stream connected and being measured;
3. exact digital silence;
4. measurable but production-risk quiet input;
5. verified signal;
6. near-full-scale or clipped-sample risk; and
7. recording started.

The recorder samples the actual time-domain stream, calculates sample peak and RMS in dBFS, retains a rolling two-second history, and renders zero input at zero height. The old frequency-bar visualization forced a visible minimum even for exact zero and could make a disconnected route look alive.

Before a take starts, Quipsly now performs a fresh 1.2-second check. Digital silence, very quiet input, and clipping risk hold the take and explain the condition. The operator can repair the route and retry or choose the explicitly labeled **Record anyway** action. An override is written to the session event ledger; it is never hidden. This protects production work without turning the check into an irreversible gate.

The recorder also shows the browser-observed device label, sample rate, channel count, and processing settings. **Call clarity** requests browser echo cancellation, noise suppression, and automatic gain control. **Studio source** requests all three off. The UI correctly says that Studio source is less processed by the browser, not “uncompressed”; `MediaRecorder` may still encode the result.

RMS dBFS is labeled as an electrical level check, not perceptual LUFS. Delivery loudness measurement and mastery remain complete-decode downstream operations.

## Physical hardware finding

The attached hardware was inspected outside the app at the native AVFoundation boundary:

- Canon EOS R8 through EOS Webcam Utility was available as a live video device.
- The source negotiated raw NV12 at 1920×1080 and a short H.264/AAC capture completed successfully.
- A retained still showed a genuine dark room image rather than Canon's disconnected-camera slate or a black/no-signal frame.
- Core Audio exposed `MOTIV Mix Virtual` at 48 kHz stereo, but not a directly named physical MV7i route in the current inventory.
- A short capture through the virtual route decoded to 114,688 samples whose peak and RMS were both negative infinity: every sample was exact digital zero.

This proves the Canon preview path is currently live and the exposed MOTIV virtual path is currently silent. It does not prove that the MV7i hardware is absent; MOTIV Mix may simply be routing no physical input into its virtual output. The physical Shure route must be restored or deliberately routed before a production browser take.

The test artifacts were temporary acceptance files, not canonical episode media, and were not uploaded, attached, rendered, or published.

## Real UI operation

The retained local QA operator authenticated into the genuine High Ground Odyssey Episode 8 recorder in both compact and desktop layouts. The visible UI correctly rendered:

- the preflight status panel;
- numeric peak and RMS dBFS;
- the explicit RMS-versus-LUFS boundary;
- processing presets and individual controls;
- zero-height initial meter history; and
- the Start/Record-anyway control contract.

The controlled browser surfaces stopped at the browser/OS permission boundary before returning a media stream. The UI now reports **Waiting for browser** in that state instead of claiming it is listening. This browser-control limitation is not counted as a microphone result; the native AVFoundation capture is the current hardware evidence.

## Verification

- pure time-domain meter and classification tests cover digital zero, quiet input, healthy signal, near-full-scale risk, sample-weighted RMS, truthful zero-height display, and pre-stream copy;
- a recorder component operation supplies a 48 kHz stereo `MOTIV Mix Virtual` stream containing exact zeros, confirms **Digital silence**, confirms the **Record anyway** escape hatch, and proves `MediaRecorder` is not constructed on the first attempt;
- focused recorder tests: 10 pass;
- Nest TypeScript: pass;
- `git diff --check`: pass.

## Next acceptance gates

1. Route spoken MV7i signal into a directly identified Core Audio input or deliberately into MOTIV Mix Virtual.
2. Run the web recorder preflight and observe stable spoken peak/RMS values with Studio source processing.
3. Record a short real take, stop it, play it start-to-finish, and compare the browser file with the direct 48 kHz/24-bit Mac master.
4. Rehearse deliberate route loss and verify the browser surface warns while the native master preserves its stronger exact-device continuity receipt.
5. Attach the accepted take to the Episode 8 timeline, transcribe it, inspect decoded signal evidence, and audition mastery without overwriting the source.
