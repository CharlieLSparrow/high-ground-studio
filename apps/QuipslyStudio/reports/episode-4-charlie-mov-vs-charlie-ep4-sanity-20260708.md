# Episode 4 Charlie MOV vs Charlie Ep4.wav transcript sanity check

Generated: 2026-07-09T04:34:32.892463+00:00

## Verdict

This sanity check does **not** indicate that all Charlie MOV files are wrong. It indicates the previous offsets were wrong, and only two Charlie MOV files have strong transcript-backed placement against `Charlie Ep4.wav`.

## File-by-file read

### IMG_3746.MOV

- Verdict: **NOT PROVEN / LIKELY SETUP OR WRONG SPINE SECTION**
- Prior/current offset being challenged: `5443.9` seconds
- Best/median transcript implied offset: `2998.193` / `2998.193` seconds
- Reliable anchors by stricter check: `0` of `1` samples
- Best available phrase is not reliable enough: source `40.807s`, overlap words `yes`
- Phrase: - That's fine. - Yeah, exactly. - Yes, baby. - All right, I'm gonna record with Scott here in a minute as soon as he calls back.

### IMG_3749.MOV

- Verdict: **MATCHES CHARLIE EP4 WAV STRONGLY**
- Prior/current offset being challenged: `3210.8` seconds
- Best/median transcript implied offset: `-9.012` / `-6.077` seconds
- Reliable anchors by stricter check: `2` of `3` samples
- Best reliable phrase: source `1188.077s` -> sequence `1182.000s`, implied offset `-6.077s`
- Phrase: Alright, I'll read my part here, so Stephen Kotler in The Rise of Superman, one of my favorite books, by the way, describes flow as living in that narrow channel between boredom in anxiety and he shares a wonderfully

### IMG_3751.MOV

- Verdict: **MATCHES CHARLIE EP4 WAV STRONGLY**
- Prior/current offset being challenged: `3418.6` seconds
- Best/median transcript implied offset: `5873.293` / `5871.469` seconds
- Reliable anchors by stricter check: `2` of `3` samples
- Best reliable phrase: source `532.355s` -> sequence `6402.000s`, implied offset `5869.645s`
- Phrase: and we all went and got food and you kind of just picked off everybody's plate and we were all so excited to have you and so excited that you were like participating in things that we were all like so happy to give us your food and I don't remember who it was but somebody was like stop giving him all your food he can get up with.

## Practical next action

- Use transcript-anchored v3 offsets for `IMG_3749.MOV` and `IMG_3751.MOV` as review candidates.
- Keep `IMG_3746.MOV` held until manually reviewed or compared against a raw call/audio spine, because it looks like setup chatter that may not belong in the current `Charlie Ep4.wav` edit spine.
- Do not call Episode 4 fully synced until Homer/Insta360/call audio receives the same sanity pass.

## Source evidence

- Offset search: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-charlie-mov-transcript-sanity/20260709-002430/episode4-charlie-mov-offset-search.json`
- Transcript spine: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/20260701-131412-466404-transcript-spine/episode-04.transcript-spine.draft.json`
- Media folder: `/Volumes/My Passport/Episode 4`
