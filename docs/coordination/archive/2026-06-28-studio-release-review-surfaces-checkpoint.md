# Studio release review surfaces checkpoint - 2026-06-28

## What changed

The Studio release/package validator was producing false blockers for Episodes 2-6 because it trusted cached `codecSummary` dimensions only. Several package rows had empty codec summaries even though the media files existed, had video, and could be probed directly.

`apps/QuipslyStudio/script/validate_release_packages.py` now falls back to `ffprobe` when cached dimensions are missing. It also avoids warning on a zero-ish long-form A/V duration spread.

## Current validation truth

- Release root: `/Volumes/My Passport/Episode_and_Shorts_Test`
- Validation JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/release-validation.json`
- Validation notes: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/release-validation.md`
- Blocked episodes: none
- Warning episodes: Episode 1 and Episode 4
- External publishing: false
- External schedules created: false
- Receipt truth created: false
- Source files mutated: false
- Versions overwritten: false

The package set is locally reviewable, not published. Episode 1 still needs the duration-candidate watch/listen decision. Episode 4 still needs sync/duration mismatch review before podcast/RSS or final publishing confidence.

## Current review doors

- Main review board: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/index.html`
- Studio review theater: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-review-theater/latest-studio-review-theater.json`
- Watch/listen review room: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-watch-listen-review-rooms/latest-studio-watch-listen-review-room.json`
- Next review card: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-next-review-card/latest-studio-next-review-card.json`
- Shorts review batch: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches/latest-shorts-review-batch.json`
- Shorts decision ledger: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-short-review-decision-ledger.json`
- Human review ledger: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/human-review-ledger.json`

## Current counts from regenerated surfaces

- Episodes: 6
- Long-form video rows: 12
- Audio rows: 6
- Ready shorts from package desk: 43
- Current shorts review batch rows: 12
- Receipt slots: 48
- Captured receipts: 0
- Needs-attention episodes in theater: 2

## Next safest action

Open the Studio review theater and watch/listen the current local packages. Start with:

1. Episode 1 v003/v004 duration candidate evidence.
2. Episode 4 sync/duration mismatch.
3. Episodes 2, 3, 5, and 6 quality/pacing/platform review.
4. The current 12-item shorts batch.

Do not claim anything is uploaded, scheduled, published, approved, or receipt-backed until a real platform receipt or URL is captured.

## Validation run

```bash
python3 -m py_compile apps/QuipslyStudio/script/validate_release_packages.py
apps/QuipslyStudio/script/agentctl.sh release-package-validation '/Volumes/My Passport/Episode_and_Shorts_Test'
```

Result:

```json
{
  "blockedEpisodes": [],
  "ok": true,
  "warningEpisodes": [1, 4]
}
```

