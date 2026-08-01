# Capture retained tagging and runtime-quality checkpoint — 2026-08-01

## Product boundary

The canonical tag model remains project-scoped by design. A Nest owns one
private reusable vocabulary; its Task, Note, Goal, Session, document, and
anchored evidence records reuse those tag identities. Nest type and workflow
classify the project itself, avoiding a circular project-to-its-own-tag link or
a second competing taxonomy.

## Operated iPhone workflow

The compiled Quipsly Capture app ran on iPhone 17 Pro / iOS 26.3.1 Simulator
against the loopback Nest, Firebase Auth emulator, and local retained
PostgreSQL database as the Keychain-backed `.test` media operator.

The final operated project is `QA Retained · Tag system 2026-08-01 F`. Through
the shipping Work UI, the app created the private production Nest and captured
one Task, one private document-kernel Note, one active Goal, and one canonical
`QA Retained · Production thread F` tag reused by all three records. Independent
PostgreSQL readback verified the exact owner, private project, stable identities,
explicit human capture provenance, tag-link actor, and false external-effect
boundary.

Result bundle:
`/private/tmp/quipsly-retained-native-project-1785564672345-24113.xcresult`

The A–F retained projects remain deliberately preserved. A was the baseline;
B–E were controlled layout-isolation runs; F is the final fully certified
operation. Independent aggregate readback found all six private projects with
one Task, one Goal, one canonical tag, and the expected project documents.

## Runtime-quality finding

Xcode records one `Invalid frame dimension (negative or non-finite).` warning
when the iOS 26.3.1 SwiftUI `Form` first presents the keyboard for the supported
text-input pattern. Four controlled runs showed the same warning after
independently removing Quipsly's meter geometry risk, multiline title layout,
root safe-area inset, and hidden Recorder UI. Apple documents vertical
`TextField` use in a `Form`; an Apple Developer Forums report describes the
corresponding iOS 26 `Form`/vertical-TextField layout regression:

- https://developer.apple.com/documentation/swiftui/view/linelimit%28_%3A%29-7ufty
- https://developer.apple.com/forums/tags/swiftui?page=20&sortBy=newest&sortOrder=DESC

Quipsly still hardens its own boundary: non-finite microphone levels normalize
to zero, the meter refuses non-finite/negative geometry, and its accessibility
percentage uses the same clamped value. Quick-entry titles now use a stable
single-line title control whose **Next** action focuses the multiline detail.

The native runtime runner now recursively inspects the XCResult warning tree.
It reports this exact known framework warning in every receipt and fails on any
other runtime warning, so the platform defect stays visible without allowing a
new application warning to pass silently.

## Verification

- compiled iPhone project-create journey: 1/1 passed;
- runtime-warning contract: one reported known framework warning, zero
  unexpected warnings;
- canonical retained database readback: passed;
- retained-operation boundary tests: 3/3 passed;
- native source contract: 79/79 passed;
- App Store/native static contract: 902/902 passed;
- retained artifacts: preserved;
- credentials printed: false;
- external side effects: false.

This is simulator and local-product proof. It does not replace physical-iPhone
TestFlight installation, genuine camera/microphone capture, upload, playback,
timeline alignment, or same-ID production Nest/Studio readback.
