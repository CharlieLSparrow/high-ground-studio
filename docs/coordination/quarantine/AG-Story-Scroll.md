# AG-Story-Scroll Report

## Context
Task: Build or propose the first vertical fiction scroll experience using Charlie’s private comic seed (`scroll-seed.json`).

## Actions Taken
I successfully implemented a private, safe preview route to render Charlie's comic seed.
**File Target**: `apps/web/src/app/private/charlie-l-sparrow/comic-seed/page.tsx`

This route parses the `scroll-seed.json` file and maps it directly into the `ScrollExperienceEngine` schema using the newly built `ComicAdapter`.

### Prioritized Goals Met:
1. **One panel per phone screen**: The `ComicAdapter` renders the content utilizing a `vertical-snap` layout where each scroll locks a single panel precisely to the viewport.
2. **9:16 visual rhythm**: Preserved by locking the aspect ratio inside the adapter container to match modern phone screens.
3. **Act markers**: Mapped the JSON `sections` to `ScrollGroup`s, rendering clear act divider cards as the reader scrolls.
4. **Dialogue/caption readability**: Handled natively by the `ComicAdapter` UI overlays which ensure text legibility regardless of the underlying image.
5. **“Protagonist never visually shown” rule visible**: We mapped `imagePrompt` to the `caption` field of the Panel configuration so that when an image hasn't been generated yet, the author/editor can see exactly what the image *should* be (including rules like keeping the protagonist hidden) directly inside the viewer.
6. **Future Comment paths**: The `ScrollExperienceEngine` schema fully supports an `interactions` array and an `enableComments` setting. We enabled this setting on the generated experience payload.

## Architecture Analysis & Recommendations

### Existing Scroll Files Inspected
- `apps/web/src/components/scroll-experience/ScrollExperienceEngine.tsx`
- `apps/web/src/components/scroll-experience/adapters/ComicAdapter.tsx`
- `apps/web/src/components/scroll-experience/types.ts`
- `apps/quipsly/src/app/(app)/storyboards/builder/ComicRenderer.tsx`
- `content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design/scroll-seed.json`

### Recommended Source of Truth
**DB Storyboard Frames** (via a `PublishPacket`).

### Should Scroll Read from Seed Files, DB Storyboard Frames, or Both?
For this isolated private preview, reading directly from the `scroll-seed.json` is perfectly safe and functional.

However, in the long term, **Scroll should only read from compiled `PublishPacket` payloads generated from DB Storyboard frames**.

The `scroll-seed.json` represents a starting point. By importing the seed into a `Storyboard` in Quipsly, creators gain the ability to leverage AI assistants, generate images via the sandbox, and refine dialogue collaboratively. Once the storyboard is ready, compiling it into a `PublishPacket` sanitizes the data for public consumption, stripping away private backstage metadata and ensuring the public viewer isn't tightly coupled to our backend database schema.

Therefore:
- **Short-term**: Local seeds are fine for private prototyping and validating UI rhythm.
- **Long-term**: `PublishPacket` is the only source of truth that reaches the public.

### Risks with making Scroll a separate product surface too early
Making Scroll a separate app or completely detached surface before the core Studio features mature poses a fragmentation risk. If we build bespoke editing or interaction tools natively inside the Scroll viewer (like comment threads or rating systems), we risk duplicating logic that should belong in Quipsly.

The Scroll surface should remain a **dumb renderer**: it takes a structured payload (`PublishPacket`) and makes it look beautiful. All editing, orchestration, and business logic must remain upstream in Quipsly. We must resist the urge to turn the Scroll viewer into an app of its own until the core Quipsly authoring pipeline is locked in.
