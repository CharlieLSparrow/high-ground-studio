# Video source-evidence continuity

Date: 2026-08-06
Status: implemented and simulator-operated; retained physical-video operation open

## Outcome

Quipsly now carries video capture truth from the iPhone's immutable local
source profile into both creator-facing review surfaces:

- Capture Library shows the requested quality, the actual configured format,
  whether the request was fulfilled exactly, camera pressure at Start, and the
  decoded movie profile;
- Nest Session Source Evidence projects the same requested/configured boundary
  alongside complete decoded movie evidence from the uploaded source; and
- audio-only sources omit the video projection entirely instead of showing an
  empty or inferred video card.

This closes a misleading gap. Before this slice, Capture retained the complete
profile in its upload manifest, but Library reduced the display to camera and
recorded media while Nest projected only the audio runtime. The evidence
existed but was not available where a creator diagnoses a take.

## Truth boundaries

The three video facts remain deliberately separate:

1. **Requested** is creator intent, such as `production-4k-24`.
2. **Configured** is the camera format Quipsly actually locked before capture.
3. **Recorded** is the track, dimensions, cadence, codec, and transform read
   from the completed movie.

An exact upload checksum does not collapse these facts. A source can be
byte-verified while its camera intent was not fulfilled, and a configured
format does not prove the completed movie decoded as expected.

Nest projects only the operational facts needed to diagnose the source. It
does not expose the camera device unique identifier. Requested and configured
values are immutable capture evidence, and recorded values are decoder
evidence; the review surface does not rewrite source media.

## Verification

- Quipsly source-evidence suites: 3 suites, 56 tests passed.
- Quipsly TypeScript typecheck passed.
- Clean generic iOS Simulator build passed.
- Focused Capture Source Evidence UI journey passed.
- Result bundle:
  `/tmp/quipsly-video-evidence-derived/Logs/Test/Test-HighGroundCapture-2026.08.06_19-12-24--0600.xcresult`.

The focused UI fixture proves the vocabulary and accessibility reachability;
it is explicitly labeled as synthetic and performs no upload or receipt write.

## Remaining operation

The next physical-video operation must create front- and rear-camera sources
on a supported iPhone, upload them, and compare the Capture Library readback
with the same sources in Nest and the editor. It must include at least one
exact 4K/24 take, one camera switch boundary, and one intentionally unsupported
or constrained quality case when safely reproducible. Until then, this slice
is not described as physical-camera qualified.

