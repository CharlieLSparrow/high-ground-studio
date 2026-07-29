# Branching Baselines for Quipsly Studio

Status: accepted direction, lightweight first pass
Last updated: 2026-06-30
Active surface: apps/QuipslyStudio

## Product verdict

Branching Baselines should become Quipsly Studio's edit-versioning model.

The idea is strong because it matches the core Quipsly promise:

- whole source media stays intact;
- sync truth is protected;
- episode edits, clip-weaving experiments, and shorts variants remain transparent metadata;
- humans and agents can try bold editorial options without making the main timeline scary;
- publication candidates can be frozen without duplicating raw media.

The dangerous version is building a full Git-for-video system before the editor is stable. Do not do that yet.

The useful version is named decision branches over one source spine.

## Research signals

Final Cut Pro uses duplication and snapshots as explicit protection mechanisms. Apple documents duplicating projects to create new versions and snapshot projects to protect compound/multicam references from accidental changes. That maps to our distinction between lightweight edit branches and frozen publish/protection snapshots.

Adobe Premiere's Team Projects and Productions distinction also reinforces the split: cloud collaboration/versioning is different from long-form media organization. Adobe's Productions guidance notes that primary clips can live in one project and be referenced by others for performance, while teams own or hand off timelines. That maps well to Quipsly's idea of shared source truth plus branch-specific decision ownership.

Quipsly should take the principle, not the traditional NLE clutter.

## Current Quipsly architecture audit

The current model already has most of the right pieces:

- `VideoProject` owns media bin, sequences, and Nest documents.
- `MediaSequence` currently acts as one edit truth for an episode/session.
- `VideoLane` is a whole synced source lane.
- `SourceVideo` stores media/proxy URLs, duration, offset, and 360 flag.
- `VideoTag` stores SHOW/SKIP/focus decisions over sequence time.
- `EditDecisionIntent` stores why a cut exists, risk, cadence, J/L-cut metadata, cover strategy, and review status.
- `ShortClipCandidate` stores shorts as recipes over episode sequence time.
- `NativeEditorSession` stores the active sequence and project as one local session JSON.
- `ProjectStore` already has update/undo/session save/load seams.
- `AgentServer` already exposes state, editor-loop proof, selected short proof, save/load session commands, and agent-safe edit controls.

This means Branching Baselines can be additive. We do not need to replace the playback engine first.

## Definitions

### Source spine

The source spine is the synchronized media truth:

- source lanes;
- proxy paths;
- offsets;
- durations;
- transcript source timing;
- baseline framing defaults;
- asset/proxy readiness;
- sync confidence and warnings.

The source spine must not be casually edited while making creative cuts.

### Baseline

A baseline is a named protected state of the source spine or a major creative checkpoint.

Examples:

- `sync-baseline-v001`
- `theme-added-v001`
- `episode-rough-cut-v002`
- `episode-publish-candidate-v001`

Baselines are for confidence and orientation. They should be visible in the UI as stable reference points.

### Branch

A branch is a child decision layer that inherits a baseline and stores only edit decisions or creative deltas.

Examples:

- `episode-4-first-codex-cut`
- `episode-4-clip-weave-option-a`
- `episode-4-clip-weave-option-b`
- `episode-4-tight-youtube-cut`
- `episode-4-warm-conversation-cut`

Branches are for experimentation.

### Short branch

A short branch is a child branch optimized for one output recipe. It may inherit from:

- the raw sync baseline, when the short needs a different rhythm from the episode;
- the current episode edit, when the short should preserve episode decisions;
- another short branch, when iterating variants.

Short branches should keep their own framing, captions, overlay, hook, payoff, and platform-copy decisions.

### Snapshot

A snapshot is a frozen branch/baseline for protection, review, or publishing.

Snapshots should be used when we need to say: this exact decision state is preserved.

Snapshots must not duplicate original media. They can duplicate decision metadata and manifests.

## Implementation recommendation

### Phase 1: branch identity and proof, no UI monster

Add branch metadata to `MediaSequence`:

- `branchId`
- `branchName`
- `branchRole`: `source-spine`, `baseline`, `episode-edit`, `short-edit`, `experiment`, `publish-candidate`
- `parentSequenceId`
- `sourceBaselineSequenceId`
- `branchStatus`: `active`, `frozen`, `archived`, `needs-review`
- `branchPurpose`
- `createdBy`
- `createdAt`
- `updatedAt`

Add a ProjectStore operation:

- duplicate current sequence as a branch;
- assign branch metadata;
- preserve source lane references/proxy URLs;
- make the new sequence active;
- register undo.

Add agent-visible truth:

- active branch name/role/status;
- parent branch;
- baseline branch;
- branch count;
- safe commands for duplicate branch and snapshot branch.

No merge/rebase yet.

### Phase 2: Branch Shelf UI

Replace some sidebar clutter with a small Branch Shelf:

- active branch chip in the top compass;
- branch list in left workbench mode;
- duplicate branch button;
- snapshot/freeze button;
- compare branch summaries;
- warning if a branch is based on a stale sync baseline.

The UI copy should be human:

- `Protected sync spine`
- `Trying clip weave option A`
- `Short variant from episode cut`
- `Frozen publish candidate`

Avoid programmer words like fork, merge, rebase in the main UI.

### Phase 3: branch-aware shorts

Add optional fields to `ShortClipCandidate`:

- `sourceBranchId`
- `sourceBranchName`
- `branchRelationship`: `from-sync-baseline`, `from-episode-edit`, `from-short-variant`

Shorts should display where they came from and whether they still track the parent branch.

### Phase 4: compare, promote, integrate

Only after branch identity is stable:

- compare two branches by decision counts, duration, source usage, risk notes, and export readiness;
- promote a branch to publish candidate;
- create a new branch from a selected range;
- integrate a range from an experiment branch back into an episode branch.

This is where complex clip-weaving experiments become manageable.

## What not to build yet

Do not build these in the first pass:

- arbitrary Git-like merge/rebase;
- branch conflict resolver;
- full visual diff timeline;
- duplicate media trees;
- hidden implicit branch creation on every edit;
- branches stored outside the existing session model without a clear migration path.

## How this helps Codex edit independently

Branching Baselines makes agent editing safer and faster because Codex can:

- create an experiment branch before a risky clip-weaving pass;
- keep the sync baseline clean;
- produce alternate cuts without cluttering one timeline;
- compare options from structured metadata instead of only screenshots;
- preserve publish candidates before trying more aggressive edits;
- make shorts from either the episode cut or raw source spine intentionally.

The agent control plane should eventually expose:

- `branch-list`
- `branch-create <name> <role>`
- `branch-snapshot <name>`
- `branch-activate <id-or-name>`
- `branch-proof`
- `branch-compare <left> <right>`

## UI implication

The current left/right bar idea remains sound:

- left side: tools/workbench modes;
- center: program, timeline, current branch decisions;
- right side: source grove / synced media context.

But the current visual arrangement is not sacred. The next redesign should make the center feel calmer by showing only the current branch's decisions while preserving access to the whole source spine and alternate branches.

A good editor screen should answer:

1. What branch am I editing?
2. What baseline does it come from?
3. What source lane is visible at the playhead?
4. What decision is responsible for what I am seeing?
5. Is this a publish candidate, experiment, or short variant?
6. What can I safely try next?

## Product rule

Sync once. Branch freely. Destroy nothing. Publish only from named candidates.

