# Session Capture app handoff recovery

Date: 2026-08-25

## Problem

The Session lobby previously used its canonical
`https://nest.quipsly.com/sessions/...` Universal Link for the explicit
**Open Quipsly Capture** action rendered on that same Nest page. Apple keeps a
same-domain Universal Link in Safari because continuing to browse the current
site is normally the person's intent. An installed Capture app could therefore
appear unavailable even when its Associated Domains configuration was correct.

If the app was absent or a Universal Link otherwise returned to Nest, the
`open=capture` web fallback rendered the ordinary iPhone recommendation again.
That could ask a first-time client to repeat the same unsuccessful action.

Apple references:

- [Allowing apps and websites to link to your content](https://developer.apple.com/documentation/Xcode/allowing-apps-and-websites-to-link-to-your-content)
- [Defining a custom URL scheme for your app](https://developer.apple.com/documentation/Xcode/defining-a-custom-url-scheme-for-your-app)

## Product behavior

- Shared and external links remain canonical HTTPS Universal Links. They open
  Capture when iOS chooses the associated app and otherwise retain a complete,
  authorized browser path.
- An explicit **Open Capture** action already inside Nest uses the registered
  `quipsly://session/<opaque-room-id>?mode=live` scheme. The deep link contains
  no invitation token, provider credential, participant authority, or media
  locator. Capture still re-authorizes the exact Session after sign-in.
- When an HTTPS Capture handoff lands back in the browser with `open=capture`,
  the lobby renders a bounded **Capture didn't open** recovery state. **Join in
  this browser** is primary; installing/updating the TestFlight beta and trying
  Capture again are secondary.
- The failed Capture preference is cleared. Choosing browser removes the
  fallback query, remembers the working device choice, records the existing
  deduplicated entry signal, and opens the normal call lobby in place.

## Evidence

- 67 focused Session lobby, entry-choice, deep-link, route, and Session review
  tests pass.
- Strict Quipsly TypeScript passes.
- The 196-page optimized production build passes.
- The Capture/App Store static contract passes and now verifies both the
  registered `quipsly` scheme and its bounded web builder. The gate's stale
  audio-only private-preview label was also updated for the current audio/video
  format choice.
- The in-app local browser again timed out attaching its webview before a
  rendered phone-width inspection. No visual or physical-device claim is made;
  that evidence remains in the deferred validation ledger.

