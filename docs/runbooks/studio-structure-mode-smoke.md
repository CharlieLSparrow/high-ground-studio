# Studio Structure Mode Smoke Checklist

Date: 2026-05-19

## Purpose

Use this checklist to manually smoke test the browser-local Structure Mode MVP
before a first live private deployment.

This is not a deployment runbook. Do not run Cloud Build, deploy Cloud Run,
mutate Google Cloud resources, mutate databases, or change secrets while using
this checklist.

## Route And Storage Boundary

Open:

```text
/structure
```

The MVP persists one browser-local draft in localStorage:

```text
high-ground-studio.structure-mode.v1
```

The draft includes pasted source text, source title/type, highlight cards,
selected text snapshots, source offsets, semantic types, notes, lane placement,
created timestamps, and card order.

Structure Mode is not database-backed yet. It does not create Prisma rows,
durable source records, durable span records, public projections, manuscript
files, or importer output.

## Manual Smoke Script

1. Open `/structure`.
2. Sign in with an authorized Studio account if prompted.
3. Confirm the page says the draft is saved locally in this browser and not yet
   synced to the Studio database.
4. Click `Load starter sample`.
5. Confirm starter cards appear in the expected lanes:
   - Opening
   - Story
   - Application
6. Click `Clear draft`.
7. Confirm the browser prompt.
8. Confirm source text and cards reset.
9. Paste short custom text into the source textarea.
10. Set a source title and source type.
11. Select a meaningful span inside the source textarea.
12. Choose a semantic type.
13. Choose an initial lane.
14. Click `Create highlight`.
15. Confirm one card appears in the selected lane.
16. Change the card semantic type after creation.
17. Change the card lane with the card lane dropdown.
18. Create a second card in the same lane.
19. Use `Move up` and `Move down` to reorder cards inside the lane.
20. Use `Previous lane` or `Next lane` to move a card between lanes.
21. Click `Duplicate` on a card and confirm a duplicate appears next to it.
22. Click `Delete` on the duplicate and confirm the browser prompt.
23. Confirm the duplicate is removed and the original card remains.
24. Click `Hide pasted source`.
25. Confirm the board gets more horizontal room and the source summary remains
    visible.
26. Confirm `Create highlight` is unavailable while the source panel is hidden.
27. Click `Show pasted source`.
28. Click `Export structure JSON`.
29. Confirm the export textarea contains the current draft JSON.
30. Copy the exported JSON, clear the draft, paste the JSON into `Import JSON`,
    and click `Import structure JSON`.
31. Confirm source text and cards return.
32. Click `Export outline Markdown`.
33. Confirm Markdown groups cards under lane headings.
34. Click `Copy outline as Markdown`.
35. Confirm the UI reports a successful clipboard copy, if the browser allows
    clipboard writes.
36. Refresh the page.
37. Confirm the browser-local draft survives refresh.
38. Click `Clear draft` again.
39. Confirm the browser prompt.
40. Confirm only `high-ground-studio.structure-mode.v1` is removed from
    localStorage.

## LocalStorage Expectations

When a draft exists, browser dev tools should show one key:

```text
high-ground-studio.structure-mode.v1
```

After `Clear draft`, that key should be removed. The app should not clear other
localStorage keys.

The next user edit may recreate the same key with a new browser-local draft.

## Source Editing Safety

Highlight cards keep selected text snapshots. Editing pasted source text after
card creation does not rewrite existing cards.

Existing cards remain usable, but their stored start/end offsets may point at
old source positions after a source rewrite. Export JSON before large source
rewrites so the operator has a recoverable checkpoint.

## If Reporting A Bug

Capture:

- route URL
- browser name/version
- whether the user was signed in through the expected Studio access mode
- source type selected
- source title
- rough source text length
- steps that led to the issue
- current card count
- lane where the issue happened
- whether source panel was hidden or visible
- current status message shown in the UI
- exported Structure JSON, if it is safe to share
- browser console errors

Do not include private source text in bug reports unless the report is going to
an authorized private channel.

## Known MVP Limitations

- Structure Mode is browser-local only.
- Drafts do not sync across browsers or devices.
- Clearing browser storage can remove the draft.
- Editing source text after card creation does not remap card offsets.
- There is no database-backed revision history.
- There are no importers.
- There is no drag-and-drop lane movement.
- There are no embeddings, public projections, TipTap, or Yjs.
