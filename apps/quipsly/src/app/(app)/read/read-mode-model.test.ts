import { mapPersistedReadBlocks } from "./read-mode-model";

describe("read mode persisted block mapping", () => {
  it("maps only the persisted blocks supplied by the authorized episode", () => {
    const result = mapPersistedReadBlocks([
      { stableId: "heading-1", title: "Opening", body: "Ignored heading body" },
      { stableId: "paragraph-1", title: null, body: "The real manuscript paragraph." },
    ]);

    expect(result).toEqual([
      { id: "heading-1", type: "heading", content: "Opening" },
      { id: "paragraph-1", type: "paragraph", content: "The real manuscript paragraph." },
    ]);
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "inline_clip" }),
      ]),
    );
  });
});
