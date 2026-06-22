# Native Editor Full Redesign Direction

Status: active design direction, not gospel. Revisit after live editing proof.

## Design thesis

Quipsly Studio should feel like a calm forest studio wrapped around a serious professional editor:

- Warm, nature-led surfaces instead of generic dark control-room chrome.
- One obvious visual hierarchy: Program Output first, Source Grove second, Episode Trail Map third, Workbench tools fourth.
- Every surface explains safety: whole source lanes stay intact, proxy-first editing is preferred, SHOW/SKIP are metadata markers.
- Every important human action should have an agent-readable counterpart and an accessibility identifier.

## Current pass

- Added shared section header language for calmer, more consistent panels.
- Reframed the right sidebar as the Source Grove rather than a generic source wall.
- Added source-card safety language for playable proxy vs recovery lane.
- Tightened timeline wording around trail, markers, quiet gaps, and metadata-only edits.
- Compressed transport copy around one shared spine so it takes less attention while preserving visible shortcuts.

## UX rules to keep

- Do not hide source monitors when the program output is selected.
- Do not visually imply media is chopped into clips; decisions are overlays on whole synced lanes.
- Do not make recovery states look like failure. Missing/protected media is actionable, not shameful.
- Prefer labels that teach the workflow while the user is editing.

## Next proof questions

- Can a tired human immediately tell what is playable, what is missing, what is selected, and what Play Edit will show?
- Can Codex select a source, add a SHOW/SKIP marker, zoom the timeline, and explain the result without reading pixels?
- Does the timeline become less barcode-like at Episode 1 density while still preserving decision truth?

## June 18 hierarchy follow-up

- Gave the left Workbench more width so labels and tool text have room to breathe.
- Softened dense timeline overlays so Episode 1 reads as editable terrain instead of alarm noise.
- Shifted protected/held source states toward amber recovery language instead of red failure language.
- Made the monitor wall header teach the core loop: Program Output is the fire; Source Grove keeps every synced source visible.

## June 18 full redesign pass

The native editor shell is moving toward a calmer Quipsly Studio language: warm forest-studio surfaces, fewer competing debug panels, and clearer spatial roles.

Current UI doctrine:

- Program Hearth is the main fire: it shows the publishable edit state.
- Source Grove is the always-visible camera/source context: every source follows the shared playhead and remains whole.
- Episode Trail Map is the editing surface: whole lanes stay intact; honey SHOW and clay quiet-gap decisions sit on top as metadata.
- Tool Bay is the left-side workbench: Frame, Shorts, Script, and Ship are modes, not separate app concepts.
- Transport is the spine contract: Program, Source Grove, timeline, and agent state all follow one clock.

Design caution:

Do not make the nature language cute at the cost of professional clarity. The forest metaphor exists to reduce anxiety and teach the model. It must never obscure timing, sync, media readiness, source truth, or publication proof.

## June 18 continued redesign grammar

Second-pass UI changes extend the redesign from color into workflow grammar:

- The left shelf is now the Tool Bay. It should behave like a native editor workbench, not a dumping ground for every feature.
- Tool Bay modes are compact and purpose-based: Frame, Shorts, Script, Ship.
- Source Grove cards now prioritize preview first, then the current playhead intent, then actions.
- Source actions use plain verbs: Show next 10s and Quiet next 10s.
- The Episode Trail Map now shows an operator hint strip directly above the timeline: Scrub, Zoom, Tune, Safe.
- The Program Hearth language replaces generic Monitor Wall language where appropriate. This keeps the output view emotionally central without changing the technical model.

UX rule for future passes:

If an element does not help the editor decide what to watch, where to cut, what is safe, what is selected, or how to publish, it should be demoted, hidden behind a mode, or rewritten. The app can be richly capable without every capability shouting at once.

## June 18 delivery-path addition

Ship mode now starts with a Delivery Path primer. This is part of the redesign, not merely a publishing feature.

Purpose:

- Make the path from episode edit to public release visible before the operator clicks any packet/export controls.
- Keep artifact truth separate from upload intent and publication proof.
- Teach both humans and Codex that the same episode spine can produce four output families: 16:9 episode, 9:16 shorts, podcast audio, and receipt/proof records.
- Avoid overclaiming direct publishing. Preparing a release is not the same as publishing it.

Design rule:

Every Ship-mode action should answer one of these questions: what artifact exists, what upload action remains, what receipt proves publication, or what is blocked. If an action cannot answer one of those questions, it belongs somewhere else or needs clearer language.

## June 18 agent-readable delivery path

Ship mode now includes a `Copy path JSON` action from the Delivery Path primer.

Payload contract:

- `payloadVersion`: versioned payload shape for future automation.
- `truth`: explicit reminder that artifact readiness, upload intent, and publication proof are separate.
- `activeSequenceLoaded`: whether a session is ready.
- `sequence`: title, duration, lane count, and short recipe count.
- `outputs`: one row each for wide episode master, vertical social shorts, podcast audio, and publication proof.
- `safeAgentActions`: actions Codex can help prepare without claiming publication.
- `unsafeWithoutHumanProof`: actions agents must not infer or claim without receipts.

This is deliberately not direct publishing automation. It is the agent-readable equivalent of the human Delivery Path card: what exists, what comes next, and what proof is missing.

## June 18 full redesign focus: hearth, grove, spine, workbench

This redesign direction is now the default for Quipsly Studio native editor work.

- Hearth: Program Output is the publishable truth. It should feel central, warm, and calm, not like a buried preview pane.
- Grove: every synced source stays visible and alive. Source cards are not leftovers or hidden bins; they are the editor's decision context.
- Spine: one shared playhead drives Program, Source Grove, timeline, shorts, and Codex. Any scroll, scrub, transport, keyboard, or agent action must respect that shared clock.
- Workbench: side tools should feel like quiet craft surfaces. They can be powerful, but they should not shout over the edit.
- Decisions: SHOW, SKIP, framing, shorts, captions, and publishing packets are metadata over protected source media. If the interface starts implying chopped clips, the design has failed.
- Accessibility for humans and agents is the same product requirement. Clear labels, stable accessibility identifiers, visible shortcuts, and exportable state are part of the editor, not debug garnish.

The visual target is nature-led and professional: cedar, moss, creek, honey, clay, charcoal, soft glass, readable contrast, and fewer competing panels. Warm does not mean vague. Zen does not mean underpowered. Fun does not mean toy-like.

## June 18 full redesign pass: reduce cognitive noise

This pass tightened the native editor language toward a calmer professional tool:

- Left-side mode names should be short enough to read at a glance: Frame, Cuts, Script, Ship.
- The old tool/sidebar vocabulary should not leak into the user-facing editor. If the user is trying to edit, labels should name the job, not the implementation.
- The right source wall is the Cedar Grove: synced sources remain visible as decision context. A source card should not look like a broken clip bin unless the media truly needs recovery.
- Timeline labels should be readable at editing speed. Dense SHOW/SKIP labels should appear only when the zoom level gives them room.
- Transport should teach one shared clock without becoming another dashboard. If a status pill does not clarify a shortcut, output, or safety rule, remove or shorten it.
- Visual warmth must carry function: moss for ready, honey for showing, clay for quiet/skipped, creek for time/sync, cedar/charcoal for focused work surfaces.

The next true redesign milestone is structural, not textual: the monitor area should own the top visual focus, the timeline should read like editable terrain, and the side bays should behave like quiet drawers that reveal power without crowding the edit.

## June 18 redesign pass: calm is operational

Calm is now defined as an operational property, not just a mood:

- The editor should always make the safe object obvious: originals and whole sources stay protected.
- The editor should always make the editable object obvious: SHOW, SKIP, frame recipes, cuts, captions, and publishing packets are metadata decisions.
- The editor should always make the current clock obvious: Program, Cedar Grove, Episode Spine, Cuts, and Codex share one playhead.
- The editor should always make the next action obvious: show a source, quiet a gap, tune an edge, frame a moment, prepare an output, or copy agent-readable state.
- The editor should avoid decorative metaphor where timing truth is needed. Use nature language as orientation, not camouflage.

Design implementation note: keep control labels short, put teaching copy in detail text or help text, and make selected/ready/problem states visually distinct without making the whole app feel like an alarm panel.

## June 18 orientation strip

The editor shell now includes an orientation strip between the masthead and Program Hearth.

Purpose:

- Program: what publishes.
- Sources: what exists and remains whole.
- Spine: what changes through reversible metadata.
- Ship: what leaves as episodes, shorts, audio, and receipts.

This is not decorative onboarding. It is the operating model in miniature, visible where both humans and Codex can use it before making edits. Future redesign work should keep this hierarchy intact even if the exact visual treatment changes.

## June 18 release cockpit

The editor shell now includes a compact release cockpit under the orientation strip.

Purpose:

- Keep publishing readiness visible while editing without turning the whole editor into a publishing dashboard.
- Track output families separately: 16:9 episode master, 9:16 cuts, podcast audio handoff, and publication receipts.
- Read existing truth only: artifact paths, short recipes, podcast packet path, and receipt records. The cockpit must not create a second publishing state model.
- Give humans and Codex the same next step: open Ship when an output or proof path needs work.

Rule: release readiness is not emotional. It comes from evidence: an artifact exists, a packet exists, a receipt exists, or the card says what still needs to happen.

## June 18 Codex compass

The editor shell now includes a Codex Compass below the release cockpit.

Purpose:

- Make the agent-facing operating boundary visible in the same place humans edit.
- Show current editable decision counts, short recipe counts, and publication receipt proof counts.
- Define safe agent actions as metadata-level work: SHOW/SKIP tags, frame recipes, cut recipes, and packet preparation.
- Define ask-first actions as publication, uploads, or destructive source changes.

Rule: Codex should not have a separate hidden editor model. Human editor and agent editor must share the same visible truth, same source-safety doctrine, same output readiness, and same proof boundary.

## June 18 Studio Compass consolidation

The orientation strip, release cockpit, and Codex compass have been consolidated into one Studio Compass band.

Reason:

- The Program Hearth must stay visually dominant.
- Guidance is useful only if it does not become another wall of panels.
- Human editing, release readiness, and Codex safety boundaries belong in one compact map, not three separate banners.

Current compass contract:

- Program publishes.
- Sources stay whole.
- Spine decisions change.
- Ship proves outputs.
- Codex may prepare metadata and packets; humans approve publishing proof.

Rule: if the compass grows tall enough to compete with the monitor, split detail into the Workbench or Ship mode. The top shell should orient, not overwhelm.

## June 18 Studio Compass cleanup and shared state

The obsolete orientation, release cockpit, and Codex compass helper views have been removed after consolidation into Studio Compass.

The surviving Studio Compass now includes `Copy State`, which exports the current human/Codex editor state as JSON:

- active sequence identity and duration
- lane count and short recipe count
- SHOW/SKIP decision counts
- Play Edit range count
- current playhead, playback mode, and output format
- release, shorts, podcast, and receipt readiness
- safe Codex actions and ask-first actions

Rule: agent-readable state should come from the same editor truth humans see. Do not add separate agent-only truth unless it is explicitly documented as diagnostic and not authoritative.

## June 18 next-action rail

The editor shell now includes a compact next-action rail under Studio Compass.

Purpose:

- Convert state into one safe next move instead of leaving the operator with a dashboard of facts.
- Keep the full workflow visible: edit decisions, cuts, audio, master, proof.
- Give humans and Codex the same action ladder: focus timeline, open Ship, or copy state.
- Preserve the rule that the app recommends safe moves but does not silently publish or destructively change source media.

Rule: every readiness surface should eventually answer two questions: what is true right now, and what is the safest useful next action?

## June 18 Workbench readability pass

The left Workbench should behave like a quiet tool drawer, not a second timeline.

Changes from this pass:

- Workbench header title is smaller and capped to one line.
- Helper copy is capped to two lines.
- Mode cards are tighter, with smaller icons and scale-limited labels.
- Internal product language should not leak where platform language is clearer. Example: the Frame panel can say Shorts/Reels while the tool mode remains Cuts.

Rule: left-side navigation must be instantly scannable. If a label needs explanation, put the explanation in the selected mode panel, hover help, or documentation; do not make the mode button carry the whole lesson.

## June 18 Cuts and shorts naming pass

The Cuts workbench remains the tool name, but public/platform language should say YouTube Shorts, Instagram Reels, Facebook, and LinkedIn.

Shorts doctrine:

- A short is a recipe over the episode spine, not a copied mini-project.
- A short can be one continuous segment or multiple ordered segments.
- Short segments point back to episode time and SHOW metadata.
- Exported files can have platform-specific captions, hooks, and receipt proof without changing the underlying recipe.

Rule: use `Cuts` for the internal workbench mode and `Shorts/Reels/social clips` for publishing-facing language. Do not call YouTube Shorts `YouTube Cuts`.

## June 18 Source Grove wording pass

The Source Grove should feel like a live synced camera wall, not a broken media bin.

Language rules:

- Use `proxy-safe` when a source can scrub without touching protected originals.
- Use `needs proxy` when the user needs to attach or recover playback media.
- Use `whole lane` to reinforce that source media remains intact.
- Source action buttons should say what happens at the shared playhead: Show 10s or Quiet 10s.
- Source cards choose attention; they do not cut media.

Rule: the right side exists to compare available sources at the same playhead. If it starts reading like file management first and camera choice second, redesign it again.

## June 18 Episode Spine cleanup pass

Timeline language now reinforces the core editor model:

- The surface is the Episode Spine, not a generic trail map.
- Creek marks whole synced sources.
- Honey means Program can show that source in Play Edit.
- Clay means Play Edit skips that span as a quiet gap.
- Moss marks a selected short recipe pull-out.
- The shared red playhead drives Program, Cedar Grove, and timeline together.

Cleanup note: a broken identifier drifted into `TimelineEditorView` as `timelineZoom focusControls` / `timelineZoom focusLabel`. It has been normalized to `timelineZoomFocusControls` and `timelineZoomFocusLabel`. This should be validated in the next build pass.

Rule: the timeline must never imply that the source clips have been chopped. It is a spine with whole sources plus reversible metadata decisions layered on top.

## June 18 static cleanup boundary

A static sweep after the redesign passes found no remaining code references to the broken `timelineZoom focusControls` or `timelineZoom focusLabel` identifiers.

Intentional leftovers:

- `sourceWall` remains in accessibility identifiers and some internal theme names for compatibility with existing agent/test selectors. User-facing language should say Cedar Grove or Source Grove, but stable identifiers do not need cosmetic churn.
- The docs may mention `YouTube Cuts` only as a deprecated term in a warning rule. Product-facing UI should say YouTube Shorts.
- Build validation is still required before claiming the redesign is safe. This pass only reduced obvious static drift; it did not compile or launch the app.

Rule: do not rename stable accessibility identifiers for aesthetics unless there is an explicit migration plan for Codex, UI tests, and automation clients.

## June 18 full redesign pass: calm forest studio language

The current design direction is **warm professional editor**, not generic dark NLE and not novelty forest cosplay. The interface should feel nature-y, zen, and fun because it lowers systems anxiety, but every metaphor has to clarify the production model:

- **Monitor Canopy**: the main viewing area. Program Output shows the edit; nearby source context keeps the whole-source truth visible.
- **Source Grove**: the right-side synced-source wall. Every source follows the shared playhead. Proxy-safe lanes are available now; missing/protected lanes stay visible as recovery work instead of vanishing.
- **Episode Spine**: the timeline. Whole synced lanes remain intact. Honey SHOW decisions, clay SKIP decisions, moss short recipes, and the red playhead thread are metadata over source media, not chopped clips.
- **Workbench**: the left-side tool area. Labels should be short enough to fit: Frame, Shorts, Script, Ship. Detailed explanation belongs inside the selected panel, not in cramped tabs.

Design constraints for the next UI passes:

- Keep the Program Output visually important without hiding the Source Grove or Episode Spine.
- Prefer calm status language over warning-box panic.
- Preserve shortcut visibility on controls.
- Avoid overloading the left sidebar with long words or dense rows.
- Keep Codex/agent affordances readable: state copy, selected target, safe next action, and source/proxy truth should be machine-observable and human-legible.

This pass intentionally changed naming and microcopy before another structural build/relaunch checkpoint. The next structural pass should tune spacing, pane proportions, and selected-decision ergonomics after the app is relaunched.

## June 18 redesign guardrail: fix bones before paint

During the redesign pass we found a few identifier scars from previous broad text replacements. This is now a rule for the editor redesign: if a visual pass reveals compile-risk naming damage, fix the structural wound before adding more visual polish.

Applied cleanup direction:

- Keep Swift identifiers mechanical and stable (`onZoomChanged`, `setTimelineZoomDetail`, shared-playhead helpers) while letting the UI language become warmer.
- `Source Grove` can be the human label while old `sourceWall` accessibility identifiers may stay stable until the agent contract is intentionally versioned.
- The selected source cue should explain what the chosen lane controls, not just repeat the filename.
- Left workbench labels should fit without truncation: Frame, Shorts, Script, Ship.

No validation was run in this pass; the next validation checkpoint should build and relaunch the native app before further layout surgery.

## June 18 naming correction: Source Grove wins

Use **Source Grove**, not Cedar Grove. Cedar Grove is cute but less clear. The product metaphor should reduce cognitive load, not add a private vocabulary test. Source Grove tells the editor exactly what lives there: all synced sources, visible together, following the shared playhead.

## June 18 structural redesign pass: center stage, quiet support

The editor should feel like a calm production room, not three dashboards fighting for attention. This pass moves the design toward:

- **Center stage first**: the Monitor Canopy and Episode Spine are the work. Sidebars support selection, framing, shorts, script, shipping, and recovery.
- **Quiet side surfaces**: Workbench and Source Grove should be narrower and calmer. If a sidebar needs a paragraph to explain itself, the wording or hierarchy is wrong.
- **Source Grove as selection/recovery, not a second timeline**: it shows synced sources, proxy truth, and lane actions. It should not visually compete with the Episode Spine.
- **Episode Spine as the mental model**: whole lanes remain intact; honey/clay/moss/red-thread language should clarify source-safe editing, not decorate it.
- **Native editor posture**: persistent columns are good, but their density must respect macOS editor patterns: sidebars orient and select; the main canvas carries complexity.

Small but important code cleanups from this pass:

- Added `sourceGroveGradient` while leaving `sourceWallGradient` as a compatibility alias.
- Narrowed the left Workbench and right Source Grove ideal widths so the central edit stage has more breathing room.
- Tightened selected-decision and zoom guidance copy.

Next visual checkpoint should inspect the live app at the common editing window sizes and tune proportions from evidence, not guesses.

## June 18 output-path clarity pass

The editor chrome should keep the four delivery paths visible without turning them into four disconnected tools:

- **Episode**: the 16:9 master for YouTube, Patreon, episode pages, and long-form review.
- **Shorts**: 9:16 recipes for YouTube Shorts, Instagram, Facebook, LinkedIn, and future social outputs.
- **Podcast**: audio handoff for Spotify, Apple Podcasts, and any future podcast-hosting ledger.
- **Proof**: receipts, URLs, provider IDs, and publishing evidence after files leave the editor.

This is a product architecture rule as much as a UI rule. Quipsly should make output paths obvious while preserving one living Episode Spine underneath them. The user should not feel like they are copying work into a new app every time they need a new format.

## June 18 native platform policy: latest stable first

Quipsly native apps should not back-deploy by default while we are pre-customer and building a demanding media editor. The default policy is now:

- Native Quipsly macOS targets: **macOS 26.0+**.
- Native Quipsly iOS/iPadOS targets: **iOS/iPadOS 26.0+**.
- Use the latest stable SDK/toolchain available for the project.
- Do not add compatibility shims, availability branches, or old-platform fallbacks unless there is a named user, named revenue reason, or explicit product decision.
- If a future customer requires older OS support, treat it as a dedicated compatibility lane with its own cost/benefit decision, not as invisible default drag on the main editor.

This is not about being fancy. It is about avoiding architecture bloat while the product is still proving the core loop: one Episode Spine, proxy-first local editing, 16:9 episode output, 9:16 social output, podcast audio handoff, publication receipts, and agent-readable state.

## June 18 Ship workbench production contract

Ship is not an export drawer. Ship is the production truth lane for the complete editor goal.

The native editor must keep four states separate:

1. **Prepared**: local artifact, handoff packet, copy, caption, thumbnail, or audio packet exists.
2. **Approved**: a human intentionally chose this output for posting or scheduling.
3. **Posted**: the output was uploaded, scheduled, or sent to a provider by a human or future connector.
4. **Proved**: receipt URL, scheduled URL, provider ID, or other durable proof was captured in the ledger.

Quipsly may help prepare and organize everything. It may copy commands, create handoff folders, and surface safe next actions for Codex or a human editor. It must not collapse prepared/post-ready into published. Publication truth requires proof.

This matters for the full product objective:

- 16:9 episode output can be prepared for YouTube, Patreon, and episode pages.
- 9:16 short recipes can become social posting packets for YouTube Shorts, Instagram, Facebook, and LinkedIn.
- Podcast audio can become a Spotify/Apple handoff packet.
- Receipts prove what actually shipped.

The same Episode Spine remains the source of truth underneath all of these outputs.

## June 18 Ship UI production-state ladder

The Ship workbench now needs to show the production truth model directly in the editor, not hide it in docs or JSON. The visible ladder is:

1. **Prepared**: files, packets, captions, ledgers, and handoff folders exist.
2. **Approved**: a human intentionally chooses what should be posted or scheduled.
3. **Posted**: upload, schedule, or provider handoff has happened.
4. **Proved**: receipt URLs, scheduled URLs, provider IDs, or durable proof are captured.

This is not bureaucracy. It is anti-anxiety product design. Humans and Codex can prepare aggressively without accidentally claiming a release shipped. The UI should make the next safe action obvious while protecting publication truth.

The current implementation intentionally keeps approval/posting conservative because the production ledger does not yet model every approval and provider action as first-class database records. That is the next architecture frontier for a grown-up publishing system.

## June 18 Ship safe-next-action queue

The Ship workbench should not feel like a box of unrelated export buttons. It should read like the next safe step in a real production room:

1. **Prepare artifacts**: build the 16:9 episode handoff, 9:16 social queue, podcast packet, ledger, cockpit, and proof checklist.
2. **Human review**: inspect the outputs, copy mission state, and decide what should actually go out.
3. **Post or schedule**: perform the upload/schedule/provider action manually or through a future connector.
4. **Capture proof**: paste URLs, scheduled URLs, provider IDs, and notes into the receipt ledger.

The important Codex boundary is not "Codex cannot help." Codex should help aggressively. The boundary is that Codex-safe work is non-destructive and honest: prepare, inspect, summarize, queue, copy, and list proof gaps. Posting and proof require a real provider action or a human-captured receipt.

This keeps the editor useful for the full publishing objective without letting the UI quietly collapse "artifact exists" into "the episode shipped."

## June 18 Ship checklist JSON contract

The Ship workbench now needs a copyable checklist for agent and collaborator handoff. This checklist is not a secret backdoor and not a publish command. It is a readable truth packet:

- current loaded sequence title, duration, lane count, and short recipe count
- artifact-family readiness for 16:9 episode, 9:16 social shorts, and podcast packet
- ledger counts for prepared records and captured receipts
- safe next actions with explicit `codexSafe` and `humanRequiredBeforeAction` flags
- per-platform record status for artifact readiness, copy readiness, and receipt capture

This is the editor equivalent of saying: "Here is what is true, here is what is safe, here is what still requires a human or real provider event." That is core to making the editor usable by Codex without turning it into an unreliable autopublisher.

## June 18 explicit destination matrix

The complete editor goal names concrete destinations, so Ship needs concrete destination lanes:

- YouTube for the 16:9 episode master
- Patreon for supporter/episode release
- YouTube Shorts for 9:16 short output
- Instagram for Reels/social short output
- Facebook for social short output
- LinkedIn for professional social short output
- Spotify for podcast audio
- Apple Podcasts for podcast audio

The matrix should show each lane as a platform destination with separate status for artifact readiness, ledger existence, and receipt proof. This is not an upload connector yet. It is a truth surface and handoff map so humans, Codex, and future provider integrations all speak the same release language.

## June 18 platform next-action language

Every platform card should answer "what do I do next here?" without requiring the editor to infer the workflow from a status pill:

- **load episode / needs prep**: load the episode and prepare release artifacts first
- **needs ledger**: artifact exists, but the platform needs a receipt slot
- **ledger**: ledger exists, but copy/artifact fields need review before posting
- **ready to post**: human/provider upload or scheduling can happen, then proof must be captured
- **proved**: receipt exists and should stay attached to the release lane

This keeps each platform lane actionable while preserving the same core rule: Quipsly may prepare and explain aggressively, but posting/proof are real events.

## June 18 single platform payload source

The Ship checklist JSON and destination matrix JSON should share one platform payload source. Otherwise the app will eventually tell collaborators two subtly different stories about the same release.

Current contract:

- the visible destination matrix is the human overview
- `Copy matrix` is the focused platform handoff
- `Copy checklist` includes the same `destinationMatrix` payload inside the broader safe Ship queue

If we add TikTok, Substack, Quipsly-hosted podcast feeds, direct YouTube upload, Patreon API posting, or analytics receipts later, they should enter through this shared platform payload shape first.

## June 18 native distribution policy

Native Quipsly apps should use TestFlight as the standard beta distribution lane for collaborators and testers, while keeping local builds as the fast development loop.

Rule of thumb:

- **local builds** are for speed, debugging, proxy/media experiments, and Codex-driven iteration
- **signed local builds** are for occasional emergency or device-specific testing
- **TestFlight** is for Mako, Homer, Melissa, Patreon/beta testers, and anyone outside the dev machine
- **App Store** comes after the app surface is stable enough for public release

For the editor, TestFlight is especially important because sandboxing, external-drive access, helper packaging, file permissions, proxy cache locations, and export destinations are product truth. If it fails in TestFlight, that is evidence we need to design the workflow better, not an annoying distribution detail.

Detailed policy lives in `docs/quipsly/native-app-testflight-distribution-policy.md`.

## June 18 human approval packet

Ship needs a review artifact before it needs a full approval database. The human approval packet is copyable JSON that says:

- what sequence is being reviewed
- which destinations are ready, incomplete, or already proved
- what a human should check before posting or scheduling
- what Codex can safely do before approval
- what Codex must not claim without a human/provider event

This moves the product toward real production publishing without inventing false automation. The future database version can promote this into first-class approval records after the workflow proves itself in real episode work.

## June 18 TestFlight and collaborator readiness surface

Ship now needs to show collaborator readiness inside the editor because the native app is becoming a real production tool, not a private demo. The active native editor is `apps/QuipslyStudio`. `apps/quipsly-mac` and `apps/quipsly-video` are legacy/reference surfaces unless a future decision explicitly revives them.

The visible TestFlight panel should separate:

- **canonical app truth**: QuipslyStudio is the app to archive, sign, distribute, and test
- **episode session truth**: a real sequence is loaded with whole synced lanes and short recipes
- **artifact truth**: 16:9 episode handoff, 9:16 social packet, and podcast audio packet are prepared or missing
- **ledger truth**: publication records and captured receipts are counted separately
- **distribution truth**: local build success is not the same thing as TestFlight readiness
- **collaborator truth**: Mako/beta handoff requires a signed archive, TestFlight upload, install proof, and external-drive/media-permission proof

This panel is intentionally conservative. It should make the next distribution step obvious without claiming the app is shareable before signing, sandbox media access, helper packaging, and collaborator install have been proved.

The `Copy readiness JSON` action is for Codex, release notes, and handoff threads. It is not a publish command and not proof that TestFlight is done.

## June 18 Codex editor handoff contract

Codex needs the same production truth a human editor needs, but in a more explicit packet. The Ship workbench should expose a copyable Codex editor handoff that includes:

- the active app path and legacy/reference app warning
- loaded sequence title, duration, whole synced lane count, and short recipe count
- selected lane, selected decision/tag, selected short, and selected transcript segment
- current timeline zoom/fitting state
- output-family readiness for 16:9 episode, 9:16 social shorts, and podcast audio
- ledger record count and receipt proof count
- safe Codex actions
- actions requiring human/provider proof
- the next best Codex move

This is not an autopilot fantasy. It is an anti-guessing contract. Codex may edit aggressively when the app state is visible and the operation is reversible metadata over whole sources. Codex may prepare packets, copy checklists, inspect gaps, and write handoff notes. Codex must not claim approval, posting, publishing, TestFlight readiness, or receipt proof without the corresponding human/provider event.

Core invariants for every agent-facing editor surface:

- one shared playhead drives Program Output, Source Grove, and Episode Spine
- whole synced source lanes remain intact
- SHOW and SKIP are reversible metadata overlays
- proxy-first editing protects originals
- prepared artifacts are not posted artifacts
- publication requires human or provider proof

## June 18 agent-access parity requirement

The editor MVP is not complete if Codex can only operate it through fragile screenshots and guessed coordinates. Agent accessibility is part of the product, not a testing convenience.

Every serious editing/publishing surface should expose enough semantic truth for a machine editor to do useful work without drifting away from the human model:

- observe the current sequence, playhead, selected lane, selected decision, selected short, and Ship state
- understand Program Output versus Source Grove versus Episode Spine
- identify whether an action changes reversible metadata, prepares an artifact, or claims publication proof
- copy a current-state handoff packet before agent-assisted editing
- re-observe after each edit and compare against the expected invariant

Pixel control is allowed as a fallback, but it must not be the primary architecture. The preferred path is semantic app state plus stable accessibility identifiers plus copyable JSON packets. This is how human editors and Codex editors stay inside the same truth instead of creating two separate products.

## June 18 direct Codex handoff endpoint

The UI copy button is useful for humans, but Codex should not have to scrape a button to understand the editor. The local AgentServer now needs a direct `GET /codex_editor_handoff` endpoint that returns the same class of truth packet:

- active native editor and legacy/reference app warning
- core invariants
- current context from `/state`
- proof snapshot
- capability parity
- current safe actions
- publication/social handoff context where available
- semantic surfaces and accessibility identifiers
- post-edit checks
- actions Codex may perform safely
- actions requiring human/provider proof

The endpoint does not replace `/state`; it complements it. Correct agent loop:

1. `GET /codex_editor_handoff`
2. `GET /state`
3. choose a semantic command
4. execute the command
5. `GET /state` again
6. only then report what changed

Any future Codex automation, training-data capture, or model-driven edit session should prefer this loop over screen-coordinate editing.

CLI shorthand:

- `script/agentctl.sh codex-observe`
- `script/agentctl.sh codex-observe-save`
- `script/agentctl.sh codex-act-save <semantic-command> ...`
- `script/agentctl.sh codex-act-review latest`
- `script/agentctl.sh codex-session-review`
- `script/agentctl.sh codex-session-review --json`
- `script/agentctl.sh codex-release-observe`
- `script/agentctl.sh codex-release-observe-save`
- `script/agentctl.sh codex-release-act-save <release-command> ...`
- `script/agentctl.sh codex-release-act-review latest`
- `script/agentctl.sh codex-release-session-review`
- `script/agentctl.sh codex-release-session-review --json`
- `script/agentctl.sh codex-production-review`
- `script/agentctl.sh codex-production-review --json`
- `script/agentctl.sh codex-audit-status`
- `script/agentctl.sh codex-audit-status --json`
- `script/agentctl.sh codex-production-handoff`
- `script/agentctl.sh codex-handoff`
- `script/agentctl.sh state`
- `script/agentctl.sh observe-after <semantic-command> ...`

Preferred CLI loop:

1. `script/agentctl.sh codex-observe`
2. choose a semantic command from the handoff/current state
3. `script/agentctl.sh codex-act-save <semantic-command> ...`
4. `script/agentctl.sh codex-act-review latest`
5. compare the saved before and after packets before claiming success

This makes the preferred loop fast enough to actually use. The principle is simple: Codex should begin with the same production truth a human sees, act through named editor concepts, then verify the result from app state.

For longer agent-assisted editing sessions, use `script/agentctl.sh codex-observe-save` before meaningful edits. It writes a timestamped handoff/state packet under `.quipsly/agent-observations` by default. That gives humans and agents a recoverable “before” snapshot for debugging, training-data review, and trust repair if an edit goes sideways.

For actual agent edits, prefer `script/agentctl.sh codex-act-save`. It writes a before packet, command response, after packet, and summary JSON. This is the minimum useful audit record for Codex-assisted editing: what the agent saw, what it requested, what the app acknowledged, and what the app said afterward.

The `codex-act-save` summary includes a shallow scalar `stateDiff`. Treat it as a quick review aid, not the full proof. If it shows no meaningful change, inspect the full before/after packets before assuming the command failed; some legitimate changes may live deeper than the shallow diff. If it shows a surprising change, stop and inspect the full packets before continuing.

The summary also highlights `shownImportantScalarChanges` for editor-critical paths: playhead, selected objects, timeline, short recipes, format, program/source state, lane/tag/decision metadata, export state, publishing state, receipt state, and proof state. This is the first-pass human review surface. It should answer, "Did the kind of thing I meant to touch actually move?" before anyone digs into the complete before/after JSON.

Use `script/agentctl.sh codex-act-review latest` after an audited edit. It prints the command, saved packet paths, command status, response preview, and important state changes. This is not a replacement for proof; it is a humane index into the proof.

Use `script/agentctl.sh codex-session-review` after a longer agent-assisted editing session. It summarizes every saved `codex-act-save` summary in the observation folder, flags failed commands or failed after-observes, and shows which commands produced important editor-state changes. This is the session ledger humans should review before trusting a batch of Codex edits.

Use `script/agentctl.sh codex-session-review --json` when another agent, script, or future training-data pipeline needs the same ledger as structured data. Text mode is for tired humans. JSON mode is for automation. Both must preserve the same truth: command acknowledgements are not proof; after-state packets are the proof surface.

Before release or publishing work, use `script/agentctl.sh codex-release-observe`. It gathers editor handoff, `/state`, delivery readiness, publication handoff, missing receipts, mission control, destination matrix, social queue state, and podcast packet state into one release packet. This is the correct starting point for 16:9 episode publication, 9:16 social publishing, and podcast handoff work.

Use `script/agentctl.sh codex-release-observe-save` before a meaningful release-prep or publishing-proof session. It writes the release packet into `.quipsly/agent-observations` so a human can see what Codex believed was ready, missing, or still awaiting proof.

Use `script/agentctl.sh codex-release-act-save <release-command> ...` around meaningful release-prep commands. It writes before/response/after release packets and a summary with release-important changes. This is the publishing-side equivalent of `codex-act-save`: Codex can prepare aggressively, but any claim about posted/proved status must come from the after packet and real receipt/provider data.

Use `script/agentctl.sh codex-release-act-review latest` after an audited release command. It prints command status, packet paths, response preview, and release-important changes. The review rule is stricter than timeline editing: prepared artifacts are useful progress, but posted/proved requires receipt or provider proof in the after packet.

Use `script/agentctl.sh codex-release-session-review` after a longer release/publishing run. It summarizes every saved release-action summary, flags failed commands or failed after-observes, and shows which commands changed release-important state. Use `--json` when future agents or reporting scripts need the same ledger as structured data. This is the publishing-side session ledger humans should review before trusting a batch of Codex release work.

Use `script/agentctl.sh codex-production-review` when a Codex run includes both editing and release work. It combines audited edit summaries and audited release summaries into one top-level report. Use `--json` for automation or future training-data pipelines. This is the run-level index, not the proof itself; full before/after packets remain the proof surface.

Use `script/agentctl.sh codex-audit-status` before trusting or handing off a production run. It reports observation snapshots, edit audit packet counts, release audit packet counts, complete audit sets, latest files, and obvious evidence hygiene issues. This is an evidence-health check only; it does not prove the edits or release work are correct.

Use `script/agentctl.sh codex-production-handoff` to package the current Codex production evidence into one timestamped folder. The bundle includes current observe/release observe packets when the app is reachable, audit status, production review, edit/release session reviews, capture statuses, and a README. This is the portable handoff artifact for humans, future Codex runs, collaborators, or training-data review. It is still an index, not proof by itself.

Detailed operator workflow lives in `docs/quipsly/quipslystudio-codex-production-runbook.md`. Use that runbook for day-to-day Codex-assisted editing and release work; keep this redesign document focused on product doctrine and architecture direction.

## June 18 canonical naming and distribution doctrine

The active native editor implementation is `apps/QuipslyStudio`. The visible app
name can say Quipsly Mac or Quipsly Studio while branding settles, but agents
must treat the folder-level truth as canonical. `apps/quipsly-mac` and
`apps/quipsly-video` are reference/legacy trees unless a later architecture
decision explicitly revives them.

Distribution should also stay split by job:

- local builds for rapid editor development and proxy/media debugging
- TestFlight for collaborator beta installs and signed real-device proof
- App Store release later, after entitlement/privacy/support readiness

This split matters because QuipslyStudio is both a local media tool and a
collaboration/publishing tool. The local loop must stay fast enough for daily
editing, while collaborator distribution must be signed, repeatable, and honest
about what has actually been proved.
