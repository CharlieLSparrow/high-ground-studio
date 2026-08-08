# Episode 4K master conform plan — 2026-08-08

## Outcome

The latest exact full-program approval can now produce a no-side-effect 4K
master readiness plan in Advanced Studio. The plan does not queue a render. It
proves what the future render is allowed to use and makes source quality,
executor custody, storage capacity, estimated output size, and downstream
review boundaries visible before expensive work starts.

## Master source rule

The 720p review candidate is approval evidence only. It is never a master
input, never upscaled, and never relabeled. The conform will re-render the
approved branch decisions from the exact immutable source generations frozen
in the approved program manifest.

The current production profile is:

- 3840×2160 canvas;
- 24 fps;
- H.264 video;
- AAC at 48 kHz; and
- estimated storage based on a 35–80 Mbps video range plus 320 kbps audio and
  container overhead.

This profile is an output target, not a claim that every camera is native 4K.
The plan lists every video lane's measured resolution/frame rate and labels it
`native-or-larger`, `upscaled`, or `unknown`.

## Queue holds

The future queue remains held unless:

- the supplied approval is the latest decision for the exact review job;
- it is `APPROVED` and all branch/manifest/output identity fields still match;
- the approved executor is online with the same storage scope;
- that workspace is measured and durable;
- safe capacity covers the conservative high output estimate; and
- every video source has measured resolution and frame-rate metadata.

The plan independently revalidates the registered review bytes and current edit
revision through the program-review context before inspecting approval.

## UX and boundaries

After approval, Advanced Studio exposes **Check 4K master**. It shows profile,
estimated output range, safe local space, source-resolution relationships, and
the exact hold/ready explanation. It says explicitly that this is readiness
only.

Rendering the master will still create an executor-local candidate that needs
its own complete playback and technical review. Approval does not authorize a
portable upload or publication.

## Evidence

- Master conform planner tests: **3 passed**.
- Advanced Studio render/review/master-plan tests: **5 passed**.
- Strict web TypeScript and diff checks pass.
- No render job, upload, cloud operation, migration, or deployment ran.

## Next boundary

Implement the frozen master job/result contract and local 4K worker using the
approved original-source manifest. The worker must retain chunk progress,
source pre/post hashing, lease safety, complete decode, sync/clock validation,
and explicit executor-local output custody. Master playback review and portable
object-storage promotion remain subsequent, separate gates.
