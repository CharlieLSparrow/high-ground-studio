# Quipsly return start here

Generated: `2026-06-24T18:42:48`

This is a human/agent handoff map. It does not publish, upload, schedule, approve, mutate source files, or create receipt truth.

## Open first

- Return brief: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260625-004145-002854-quipsly-return-brief/index.html`
- OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-184144-894880-quipsly-os/index.html`
- Action deck: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260625-004144-576125-quipsly-action-deck/index.html`
- Validation report: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ValidationReports/20260625-004144-796475-quipsly-os-validation/index.html`

## Production surfaces

- Studio duration repair work orders: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-repair-workorders/20260625-001944-duration-repair-workorders/index.html`
- Tower review command sheet: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/tower-review-command-sheets/20260624-235349-tower-review-command-sheet/index.html`
- Tower manual calendar: `missing`
- Tower social command center: `missing`
- Photo Grove command sheet: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/CommandSheets/20260625-003127-photo-grove-command-sheet/index.html`
- Photo Grove cull suggestions: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/cull-suggestions/20260625-002550-photo-cull-suggestions/index.html`
- Nest writing runway: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingRunway/20260624-182408-writing-runway/index.html`

## Current counts worth knowing

- Return brief: `{"attentionItems": 11, "lanes": 5, "openTargets": 20, "reviewItems": 1, "topQueue": 12}`
- Action deck: `{"actions": 12, "approvalRequiredCommands": 1, "commands": 33, "safeLocalCommands": 32}`
- Validation report: `{"checks": 25, "declaredPaths": 115, "failures": 0, "lanes": 5, "passed": 25, "priorityQueue": 12, "warnings": 0}`
- Studio duration repair work orders: `{"candidateCommands": 7, "externalPublishing": false, "majorHumanReview": 1, "receiptTruthCreated": false, "sourceFilesMutated": false, "versionsOverwritten": false, "workorders": 2}`
- Tower review command sheet: `{"capturedReceipts": 0, "episodes": 6, "externalPublishing": false, "externalSchedulesCreated": false, "pendingRows": 23, "receiptSlots": 48, "receiptTruthCreated": false, "reviewRows": 24, "warningRows": 8}`
- Photo Grove command sheet: `{"clientDeliveryCreated": false, "commands": 24, "externalPublishing": false, "groups": 8, "metadataChanged": false, "originalsMutated": false, "safeFirstActions": 8}`
- Photo Grove cull suggestions: `{"clientDeliveryCreated": false, "externalPublishing": false, "metadataChanged": false, "originalsMutated": false, "pending": 160, "selectedForClientProof": 0, "sourceGroups": 8, "suggestionGroups": 8}`
- Nest writing runway: `{"capturedReceipts": 0, "draftPackets": 16, "pendingHumanReview": 16, "platformDraftItems": 80, "receiptSlots": 64, "unsafePackets": 0}`

## Safety boundary

- Local readiness is not publication.
- Review approval is not receipt truth.
- Candidate repair commands are not executed unless a human deliberately runs them.
- Original media/photos/manuscripts remain source truth and should not be mutated by these packets.

## Fresh runway command

If the boards look stale, run this from the Quipsly Studio app folder:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/agentctl.sh quipsly-os-refresh
```

This refreshes the safe local Studio, Tower, Photo Grove, Nest writing, 360, OS board, action deck, validation, and return brief artifacts. It does not publish externally, upload, delete, schedule, overwrite old versions, or mutate source media. If one lane needs review, the refresh report records it and keeps the other lanes moving.

## Latest verified proof chain

- Refresh run: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/RefreshRuns/20260624-194034-191608-quipsly-os-refresh/index.html`
- OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-194042-158211-quipsly-os/index.html`
- Validation: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ValidationReports/20260625-014042-278566-quipsly-os-validation/index.html`
- Return brief: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260625-014042-375565-quipsly-return-brief/index.html`

The latest validation checked the refresh run as first-class evidence and passed 30/30 checks with zero warnings.
