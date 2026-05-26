import assert from "node:assert/strict";
import test from "node:test";

import {
  appendLiveRoomNotebookBlock,
  applyLiveRoomUpdateToDoc,
  applyTextAreaValueToYText,
  createLiveRoomNotebookSectionText,
  createLiveRoomNotebookStarterText,
  createLiveRoomNotebookBlocks,
  createLiveRoomSessionRecap,
  createLiveRoomSessionPacket,
  createLiveRoomSnapshotDescription,
  createLiveRoomTextFromManuscriptDraft,
  createLiveRoomYDocFromText,
  createLiveRoomStateUpdateFromText,
  createManuscriptDraftFromLiveRoomText,
  decodeLiveRoomUpdateBase64,
  encodeLiveRoomDocStateUpdate,
  encodeLiveRoomUpdateBase64,
  getLiveRoomTextFromUpdate,
  insertLiveRoomNotebookBlockAfter,
  mergeLiveRoomUpdates,
  moveLiveRoomNotebookBlock,
  removeLiveRoomNotebookBlock,
  STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME,
  updateLiveRoomNotebookBlockKind,
  updateLiveRoomNotebookBlockText,
} from "../apps/studio/src/app/manuscript/live/studio-manuscript-live-room-model.ts";

test("live room yjs updates preserve concurrent edits", () => {
  const baseUpdate = createLiveRoomStateUpdateFromText("Alpha\n\nBravo");
  const charlie = createLiveRoomYDocFromText("");
  const homer = createLiveRoomYDocFromText("");

  applyLiveRoomUpdateToDoc(charlie, baseUpdate);
  applyLiveRoomUpdateToDoc(homer, baseUpdate);

  const charlieText = charlie.getText(STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME);
  const homerText = homer.getText(STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME);

  charlie.transact(() => {
    charlieText.insert(5, " from Charlie");
  });

  homer.transact(() => {
    homerText.insert(homerText.length, "\n\nHomer adds a reality check.");
  });

  const mergedUpdate = mergeLiveRoomUpdates([
    baseUpdate,
    encodeLiveRoomDocStateUpdate(charlie),
    encodeLiveRoomDocStateUpdate(homer),
  ]);
  const mergedText = getLiveRoomTextFromUpdate(mergedUpdate);

  assert.match(mergedText, /from Charlie/);
  assert.match(mergedText, /Homer adds a reality check/);
});

test("live room base64 update encoding roundtrips", () => {
  const update = createLiveRoomStateUpdateFromText("Keep this recoverable.");
  const encoded = encodeLiveRoomUpdateBase64(update);
  const decoded = decodeLiveRoomUpdateBase64(encoded);

  assert.ok(decoded);
  assert.equal(getLiveRoomTextFromUpdate(decoded), "Keep this recoverable.");
});

test("textarea diff applies minimal edits to y text", () => {
  const doc = createLiveRoomYDocFromText("");
  const text = doc.getText(STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME);
  text.insert(0, "one two four");

  const changed = applyTextAreaValueToYText(text, "one two three four");

  assert.equal(changed, true);
  assert.equal(text.toString(), "one two three four");
});

test("live room text can become a manual snapshot draft", () => {
  const draft = createManuscriptDraftFromLiveRoomText({
    title: "Tonight Room",
    text: "First paragraph.\n\nSecond paragraph.",
    timestamp: "2026-05-25T20:00:00.000Z",
  });

  assert.equal(draft.schemaVersion, 1);
  assert.equal(draft.title, "Tonight Room");
  assert.equal(draft.editorJson.type, "doc");
  assert.equal(draft.editorJson.content?.length, 2);
  assert.equal(draft.editorJson.content?.[0]?.attrs?.blockId, "live-room-block-0001");
  assert.equal(draft.editorJson.content?.[1]?.content?.[0]?.text, "Second paragraph.");
});

test("manual snapshot draft can seed live room plain text", () => {
  const text = createLiveRoomTextFromManuscriptDraft({
    schemaVersion: 1,
    title: "Library Draft",
    sourceFileName: null,
    importSummary: null,
    structureRegions: [],
    quoteReviews: {},
    editorJson: {
      type: "doc",
      content: [
        {
          type: "heading",
          content: [{ type: "text", text: "Chapter One" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Alpha " },
            { type: "text", text: "Beta." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Nested note." }],
                },
              ],
            },
          ],
        },
      ],
    },
    activeAuthorId: "homer",
    showAuthorColors: true,
    showSemanticColors: true,
    lastUpdatedAt: "2026-05-25T20:00:00.000Z",
  });

  assert.equal(text, "Chapter One\n\nAlpha Beta.\n\nNested note.");
});

test("live room text can be edited as notebook blocks", () => {
  const blocks = createLiveRoomNotebookBlocks("First note.\n\nSecond note.");

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].label, "First note.");
  assert.equal(blocks[0].kind, "note");
  assert.equal(blocks[1].wordCount, 2);

  const updated = updateLiveRoomNotebookBlockText({
    text: "First note.\n\nSecond note.",
    blockIndex: 1,
    blockText: "Second note with Homer context.",
  });

  assert.equal(updated, "First note.\n\nSecond note with Homer context.");

  const appended = appendLiveRoomNotebookBlock(updated, "Third working note.");

  assert.equal(
    appended,
    "First note.\n\nSecond note with Homer context.\n\nThird working note.",
  );
});

test("live room notebook blocks can be inserted, moved, and removed", () => {
  const base = "Agenda\n\nDraft\n\nActions";

  const inserted = insertLiveRoomNotebookBlockAfter({
    text: base,
    blockIndex: 0,
    blockText: createLiveRoomNotebookSectionText("decision"),
  });

  assert.match(inserted, /Decision\nDecision:/);
  assert.deepEqual(
    createLiveRoomNotebookBlocks(inserted).map((block) => block.kind),
    ["note", "decision", "note", "action-items"],
  );

  const moved = moveLiveRoomNotebookBlock({
    text: inserted,
    blockIndex: 3,
    direction: -1,
  });

  assert.deepEqual(
    createLiveRoomNotebookBlocks(moved).map((block) => block.kind),
    ["note", "decision", "action-items", "note"],
  );

  const removed = removeLiveRoomNotebookBlock({
    text: moved,
    blockIndex: 1,
  });

  assert.equal(removed, "Agenda\n\nActions\n\nDraft");
});

test("live room quick section templates create recognizable block kinds", () => {
  const text = [
    createLiveRoomNotebookSectionText("decision"),
    createLiveRoomNotebookSectionText("action-items"),
    createLiveRoomNotebookSectionText("question"),
    createLiveRoomNotebookSectionText("source-note"),
  ].join("\n\n");
  const blocks = createLiveRoomNotebookBlocks(text);

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["decision", "action-items", "question", "source-note"],
  );
  assert.match(blocks[0].text, /Reason:/);
  assert.match(blocks[3].text, /Useful quote or claim:/);
  assert.equal(
    insertLiveRoomNotebookBlockAfter({
      text: "",
      blockIndex: 0,
      blockText: createLiveRoomNotebookSectionText("question"),
    }),
    createLiveRoomNotebookSectionText("question"),
  );
});

test("live room notebook block kind controls preserve section body", () => {
  const markedDecision = updateLiveRoomNotebookBlockKind({
    text: "Keep the opening practical.\n\nAction Items\n- Homer / review / tomorrow",
    blockIndex: 0,
    kind: "decision",
  });

  assert.equal(
    markedDecision,
    "Decision\nKeep the opening practical.\n\nAction Items\n- Homer / review / tomorrow",
  );
  assert.deepEqual(
    createLiveRoomNotebookBlocks(markedDecision).map((block) => block.kind),
    ["decision", "action-items"],
  );

  const changedKind = updateLiveRoomNotebookBlockKind({
    text: markedDecision,
    blockIndex: 1,
    kind: "question",
  });

  assert.equal(
    changedKind,
    "Decision\nKeep the opening practical.\n\nOpen Question\n- Homer / review / tomorrow",
  );
  assert.deepEqual(
    createLiveRoomNotebookBlocks(changedKind).map((block) => block.kind),
    ["decision", "question"],
  );
});

test("live room session recap extracts structured working-session outcomes", () => {
  const text = [
    "Decision\nDecision: Keep the live room as notebook-first.\nReason: Homer can scan sections faster.",
    "Action Items\n- Charlie / revise chapter opening / tomorrow\n- Homer / review decision notes / tonight",
    "Open Question\nQuestion: Should the recap become a manuscript snapshot note?\nContext: We need session handoff history.",
    "Source Note\nSource: Plato outline\nUseful quote or claim: Courage needs practice.\nHow it should be used: Possible chapter anchor.",
  ].join("\n\n");
  const recap = createLiveRoomSessionRecap(text);

  assert.deepEqual(recap.decisions, [
    "Keep the live room as notebook-first.",
    "Homer can scan sections faster.",
  ]);
  assert.deepEqual(recap.actionItems, [
    "Charlie / revise chapter opening / tomorrow",
    "Homer / review decision notes / tonight",
  ]);
  assert.deepEqual(recap.questions, [
    "Should the recap become a manuscript snapshot note?",
    "We need session handoff history.",
  ]);
  assert.deepEqual(recap.sourceNotes, [
    "Plato outline",
    "Courage needs practice.",
    "Possible chapter anchor.",
  ]);
  assert.match(recap.summaryText, /Decisions/);
  assert.match(recap.summaryText, /Action Items/);
  assert.match(recap.summaryText, /Open Questions/);
  assert.match(recap.summaryText, /Source Notes/);
});

test("live room snapshot description carries a compact recap", () => {
  const recap = createLiveRoomSessionRecap(
    [
      "Decision\nDecision: Keep notebook-first editing for working sessions.",
      "Action Items\n- Charlie / test the room with Homer / tonight",
      "Open Question\nQuestion: Should recaps become standalone session records?",
      "Source Note\nSource: Working session outline",
    ].join("\n\n"),
  );
  const description = createLiveRoomSnapshotDescription({
    roomId: "room-123",
    recap,
    maxLength: 180,
  });

  assert.ok(description.length <= 180);
  assert.match(description, /Manual checkpoint from live room room-123/);
  assert.match(description, /D\(1\): Keep notebook-first editing/);
  assert.match(description, /A\(1\): Charlie \/ test the room/);
});

test("live room session packet captures room handoff context", () => {
  const packet = createLiveRoomSessionPacket({
    roomId: "room-123",
    roomTitle: "Tonight with Homer",
    shareUrl: "https://studio.example/manuscript/live?room=room-123",
    generatedAt: "2026-05-26T05:00:00.000Z",
    text: [
      "Decision\nDecision: Keep the section focused.",
      "Action Items\n- Charlie / turn this into a chapter note / tomorrow",
      "Source Note\nSource: Working session",
    ].join("\n\n"),
  });

  assert.match(packet, /# Tonight with Homer session packet/);
  assert.match(packet, /Room ID: room-123/);
  assert.match(packet, /Room link: https:\/\/studio\.example/);
  assert.match(packet, /1\. \[Decision\] Decision/);
  assert.match(packet, /2\. \[Actions\] Action Items/);
  assert.match(packet, /## Structured recap/);
  assert.match(packet, /Keep the section focused/);
  assert.match(packet, /## Current text/);
});

test("live room notebook starters create useful section scaffolds", () => {
  const session = createLiveRoomNotebookStarterText("working-session");
  const writing = createLiveRoomNotebookStarterText("writing-pass");
  const coaching = createLiveRoomNotebookStarterText("coaching-session");

  assert.match(session, /Agenda/);
  assert.match(session, /Parking Lot/);
  assert.match(writing, /Draft/);
  assert.match(writing, /Open Questions/);
  assert.match(coaching, /Current Reality/);
  assert.match(coaching, /Commitments/);
});
