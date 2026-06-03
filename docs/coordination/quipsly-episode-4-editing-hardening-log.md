# Quipsly Episode 4 Editing Hardening Log

Last updated: 2026-06-03

Purpose: keep the real Episode 4 editing test honest. This is the practical
place to record what felt scary, what failed, what confused the operator, and
what to fix next before calling the workflow production-ready.

Primary live route:

```text
https://studio-hm2odnvjga-uc.a.run.app/editor?project=high-ground-odyssey-manuscript&episode=episode-4
```

Current safety posture:

- Work in `Real Editing Session Mode` for the actual Episode 4 edit.
- Keep experiments in `project=quipsly-dev-lab` unless explicitly testing the
  real project route.
- Do not overwrite manuscript text or production JSON unless the action is
  clearly scoped to the current episode and recoverable.
- Record exact route, project slug, episode slug, save state, and visible
  failure text for every issue.

## What is scary

- Media sync can feel like a trap: if alignment looks wrong, the user needs a
  safe next button, not a technical explanation.
- Source health can report broken/preview-only media while the editor still
  appears usable, which may create uncertainty about whether it is safe to keep
  editing.
- Imported media cards can become mentally loud quickly. Episode 4 mode should
  stay boring: manuscript, import, spine audio, checklist, timeline, selected
  clip, save state.
- The user needs confidence that every recording/import/sync action becomes
  episode-scoped data and can be restored after reload.
- Gemini/AI assist is useful, but any AI-looking controls inside the real edit
  can feel experimental unless clearly optional and one layer away.

## What has failed or looked risky

- Previous real-mode smoke found AI recommendation controls still visible on
  imported asset cards:
  - `Apply suggestion`
  - `Applied suggestion`
  - recommendation confidence/role/track metadata
  - `Copy vault URI`
- Remote Cloud Build emitted `API key should be set when using the Gemini API`
  during static generation. The editor deployed and smoked cleanly, but Gemini
  runtime configuration still needs a focused secret/env verification.
- Media source health for Episode 4 reported mixed state during smoke:
  - some sources healthy or preview-usable
  - some sources broken
  - final export should remain blocked or clearly warned until render-usable
    sources are available.
- The sync checklist still says to use the guided wizard, but Real Editing
  Session Mode hides the guided wizard. That copy is confusing and should be
  rewritten for real mode.

## What was confusing

- `Timeline`, `default timeline`, and `DB-backed production` are technically
  useful but should be made more human-readable in Real Mode.
- `Preview-only`, `Render usable`, and `Broken sources` are valuable, but they
  need direct next actions:
  - keep editing
  - relink source
  - mark held
  - replace media
  - do not export yet
- `Use selected`, `Mark synced`, and `Set anchor here` are powerful but may be
  unclear without a selected clip/asset relationship. Real Mode needs tiny
  helper copy or disabled states when the action is not obvious.
- `Open manuscript range`, `Record this episode`, and `Live call for this
  episode` are useful, but during editing they should feel secondary to import,
  sync, and save.

## Next fixes

### P0 - Before relying on Episode 4 for final production

- Rewrite Real Mode checklist copy so it does not reference hidden lab-only
  controls.
- Add a plain-language media health summary:
  - `Good for preview`
  - `Good for export`
  - `Needs relink before export`
- Add an export-readiness gate that blocks or warns loudly when required media
  is not render-usable.
- Verify Gemini secret/env on Cloud Run without printing the key.
- Smoke a real tiny imported media asset through:
  - import
  - set as spine if audio
  - add to timeline
  - save
  - hard reload
  - confirm persistence

### P1 - Make syncing less panic-inducing

- Add a Real Mode friendly sync action for each asset:
  - `This is my main audio`
  - `This is camera video`
  - `This is reference only`
  - `Hold for later`
- Rename or explain `Set anchor here` as a human action:
  - `Line this file up at the playhead`
- Add an obvious `Undo last sync/import change` button in Real Mode if a sync
  snapshot exists.
- Show before/after offset for the selected sync target in normal language.

### P2 - Make the editing workflow feel grown up

- Add a compact Episode 4 session header:
  - project
  - episode
  - current spine audio
  - last saved time
  - export readiness
- Add a small `What changed since last save` or dirty-state explanation when
  autosave/manual save state is not obvious.
- Add a recovery drawer:
  - reload from DB
  - copy diagnostics
  - revert last sync
  - hold selected source
  - detach source from selected clip
- Keep Full Lab controls behind the existing Real Mode toggle, not inline with
  the real editing surface.

## Testing checklist for the first real Episode 4 pass

Use this exact flow after the first hands-on edit:

1. Open the live Episode 4 editor route.
2. Confirm Real Editing Session Mode is on by default.
3. Confirm the page shows only:
   - manuscript link
   - import media
   - spine audio
   - sync checklist
   - timeline
   - selected clip
   - save state
4. Import or simulate a safe small media asset without touching manuscript
   prose.
5. Set or confirm spine audio.
6. Add one asset at the playhead.
7. Mark one asset held or synced.
8. Save timeline.
9. Hard reload.
10. Confirm the same asset, spine status, timeline clip, and save state return.
11. Note every confusing label or scary moment in this file.

## Latest known live deploy

- Revision: `studio-00186-j25`
- Image tag: `real-editing-cleanup`
- Live route smoke: passed for Episode 4 Real Editing Session Mode.
- Rollback:

```bash
gcloud run services update-traffic studio --project=high-ground-odyssey --region=us-central1 --to-revisions=studio-00185-b8p=100
```

