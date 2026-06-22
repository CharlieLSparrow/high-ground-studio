# Canonical Implementation Registry

Status: active coordination guardrail.

Purpose: prevent agents and humans from building the right feature in the wrong
tree. This registry is not a product roadmap. It is the source-of-truth map for
where implementation work belongs today.

## Quipsly native editor

Canonical implementation:

```text
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
```

Current role:

- Native proxy-first episode editor.
- Whole synced source lanes.
- SHOW/SKIP/framing/shorts/transcript/publishing metadata over protected media.
- Local AgentServer and `script/agentctl.sh` semantic control surface.
- Primary proof target for human editing and Codex-assisted editing.

Visible app/process names may still say `QuipslyMac` during the branding
transition. That does not change the canonical source folder.

## Quipsly web / Nest

Canonical implementation:

```text
/Users/wall-e/Dev/high-ground-studio/apps/quipsly
```

Current role:

- Nest/project/document/account collaboration surface.
- Web-side publishing/project truth where applicable.
- Not the native local proxy editor.

## Legacy or reference editor trees

Do not implement new native-editor features here unless Charlie/Codex explicitly
revives the tree and updates this registry first:

```text
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac
/Users/wall-e/Dev/high-ground-studio/apps/quipsly-video
```

Current role:

- Reference material only.
- Useful for archaeology, not for active feature work.
- Do not copy architecture from these trees without first translating it into
  the QuipslyStudio invariants.

## Invariants for editor work

Any editor implementation work must preserve these rules:

- One shared playhead drives Program Output, Source Grove, and Episode Spine.
- Whole source lanes stay intact.
- SHOW/SKIP decisions are metadata overlays, not chopped source clips.
- Proxies are the edit/export path; originals stay protected.
- 16:9 episodes, 9:16 shorts, podcast audio, and publication proof are one
  production spine with separate readiness/proof states.
- Codex and humans must see the same truth through UI, accessibility labels,
  and semantic agent packets.

## Change control

Changing canonical ownership is allowed, but it must be explicit.

Required steps before moving a canonical implementation:

1. Update this registry.
2. Update the relevant runbook.
3. Add a short reason for the move.
4. Identify migration or quarantine actions for the old tree.
5. Make the next task prompt name the new canonical path directly.

If a task says only "Mac app", "video editor", "native app", or "Quipsly app",
agents should resolve that ambiguity against this registry before editing files.
