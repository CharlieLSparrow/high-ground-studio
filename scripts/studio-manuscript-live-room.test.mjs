import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLiveRoomUpdateToDoc,
  applyTextAreaValueToYText,
  createLiveRoomTextFromManuscriptDraft,
  createLiveRoomYDocFromText,
  createLiveRoomStateUpdateFromText,
  createManuscriptDraftFromLiveRoomText,
  decodeLiveRoomUpdateBase64,
  encodeLiveRoomDocStateUpdate,
  encodeLiveRoomUpdateBase64,
  getLiveRoomTextFromUpdate,
  mergeLiveRoomUpdates,
  STUDIO_MANUSCRIPT_LIVE_YTEXT_NAME,
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
