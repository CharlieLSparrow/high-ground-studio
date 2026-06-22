# QuipslyStudio Production Editor Gap Map

Status: active implementation scorecard.

Purpose: keep the native editor work aligned with the real product objective:
one editor that lets a human or Codex edit and prepare publication for long
16:9 episodes, short 9:16 social clips, and podcast audio without losing source
truth or publication proof.

Canonical implementation:

```text
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
```

Legacy/reference only:

```text
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-video
```

## Completion standard

The editor is not complete until current evidence proves each lane below. A
feature-looking UI is not enough. A generated packet is not enough. A command
acknowledgement is not enough. The running app, exported files, semantic state,
or receipt records must prove the work.

## 1. Native edit loop

Required:

- Load a real episode session.
- Keep whole source lanes intact.
- Show Program Output, Source Grove, and Episode Spine from one shared playhead.
- Scrub from timeline, Program, Source Grove, keyboard, and Codex without drift.
- Zoom the timeline enough for coarse review and fine cut adjustment.
- Add, trim, remove, and inspect SHOW/SKIP decisions without cutting media.
- Represent inactive/gap regions as edit metadata, not missing clips.

Evidence needed:

- Running QuipslyStudio app with real or representative episode media.
- `/state` or `codex-observe` proving one playhead and selected decision state.
- Visual proof that Program Output changes between source decisions and blank
  skipped spans.
- Before/after packets for at least one Codex-assisted edit.

Current risk:

- Timeline and Source Grove are improving, but the UX still needs stronger
  visible hierarchy and direct proof that every scroll/scrub route shares one
  clock.

## 2. 16:9 episode output

Required:

- Export a 16:9 episode master from the current Play Edit decisions.
- Preserve source safety by exporting from proxies unless raw originals are
  explicitly required.
- Prepare YouTube and Patreon metadata packets without claiming upload.
- Capture publication receipts after real platform actions.

Evidence needed:

- Exported 16:9 file path.
- Delivery packet or publish packet with title, description, artifact path, and
  destination guidance.
- Receipt records with real URLs/provider IDs after posting or scheduling.

Current risk:

- Export and packet surfaces exist, but readiness language must stay strict:
  artifact-ready is not posted, and posted is not proved until receipt data
  exists.

## 3. 9:16 short/social output

Required:

- Create short recipes from one or more segments of the episode spine.
- Support platform-facing destinations: YouTube Shorts, Instagram, Facebook,
  and LinkedIn.
- Make short recipe selection visible on the main timeline.
- Export 9:16 clips with crop/framing metadata applied.
- Prepare captions, hooks, platform copy, and posting packets.
- Track review states such as draft, keep, refine, reject, queued, exported,
  posted, and proved.

Evidence needed:

- Short recipe list with selected recipe and segment ranges.
- Exported 9:16 file paths.
- Social packet or publication queue containing platform-specific copy.
- Receipts after real posting/scheduling.

Current risk:

- Shorts workflow exists in the left workbench, but the UX still needs clearer
  timeline visualization of a selected short pull-out and whether a recipe has
  one segment or multiple segments.

## 4. Podcast audio output

Required:

- Export or prepare an audio master from the same edit spine.
- Prepare Spotify and Apple Podcasts handoff metadata.
- Keep episode audio proof separate from social/YouTube proof.
- Capture receipts after real podcast platform actions.

Evidence needed:

- Audio master file path.
- Podcast packet with destination guidance.
- Receipt records for Spotify and Apple Podcasts when posted/scheduled.

Current risk:

- Audio packet surfaces exist, but podcast workflow needs a clear UI position so
  it does not feel hidden behind video publishing.

## 5. Human editor experience

Required:

- Clear warm Quipsly-native visual hierarchy.
- Program Output is the star.
- Source Grove stays visible as synced context.
- Timeline is understandable without Premiere mental models.
- Shortcuts are visible on buttons or in tooltips.
- Left workbench labels fit and make sense: Frame, Shorts, Script, Ship.
- No source-wall or timeline state should look broken when it is only protected
  or awaiting proxy work.

Evidence needed:

- Running-app visual pass with the canonical QuipslyStudio app.
- User can explain what is selected, what is showing, what is skipped, and what
  the next safe action is without opening docs.

Current risk:

- The app is functional but still too visually dense and not yet warm/nature-y
  enough. This is a product issue, not mere styling.

## 6. Codex editor experience

Required:

- Codex can observe current editor truth semantically.
- Codex can act through stable commands instead of guessing pixels.
- Codex can save before/after evidence for meaningful edits.
- Codex can prepare release packets without claiming publication.
- Codex can hand work to humans or collaborators in one portable packet.

Evidence needed:

- `script/agentctl.sh codex-observe`
- `script/agentctl.sh codex-act-save <command>`
- `script/agentctl.sh codex-act-review latest`
- `script/agentctl.sh codex-release-observe`
- `script/agentctl.sh codex-production-handoff`

Current risk:

- Agent controls are broad, but the actual app must remain buildable and the
  semantic command surface must stay aligned with the visible UI.

## 7. Collaboration and distribution

Required:

- Local developer builds remain fast enough for daily iteration.
- TestFlight becomes the default beta distribution path for Mako/collaborators.
- Collaborator installs prove app launch, login/session, media permission, proxy
  access, and a shared editing workflow.
- Shared editing should preserve whole-source metadata semantics and avoid
  destructive conflict behavior.

Evidence needed:

- Signed archive and TestFlight upload when ready.
- Collaborator install proof.
- One shared session proof between local editor and collaborator workflow.

Current risk:

- Distribution doctrine exists, but the signed/TestFlight workflow still needs a
  real implementation pass and proof.

## Next best implementation targets

1. Make the UI show selected short pull-out and multi-segment recipe truth more
   clearly in the timeline.
2. Tighten scrub/zoom/shared-playhead proof so Program, Source Grove, and
   Episode Spine cannot drift.
3. Improve the Ship workbench so 16:9, 9:16, podcast audio, and receipts are
   visible as one release ladder.
4. Refactor large view code only when it enables safer editor work; do not
   refactor for tidiness alone while episode editing is blocked.
5. Keep Episode 1 as the primary proof lane until other episode media/proxy
   truth is reliable.

## Rule for future claims

Do not say "the editor can publish" unless the statement names the rung:

- can export
- can prepare upload packet
- can guide manual posting
- can capture receipt
- has real provider integration
- has proved published state

Precision here is not pessimism. It is how the editor becomes trustworthy.
