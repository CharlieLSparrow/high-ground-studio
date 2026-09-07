import { documentWorkspaceHref } from "./document-destination";

describe("document editing destination", () => {
  const document = { documentId: "note/one", projectSlug: "client-space", sourceLabel: "document-kind:note" };

  it("opens notes directly and preserves the matching search section", () => {
    expect(documentWorkspaceHref(document)).toBe("/notes/note%2Fone");
    expect(documentWorkspaceHref({ ...document, blockId: "body:1" })).toBe("/notes/note%2Fone#note-block-body%3A1");
  });

  it("recognizes a note tag among other metadata", () => {
    expect(documentWorkspaceHref({ ...document, sourceLabel: "origin:nest; Document-kind:Note ;other:value" })).toBe("/notes/note%2Fone");
  });

  it.each([null, "document-kind:draft", "document-kind:notebook", "description:document-kind:note"])("keeps non-notes in their writing surface (%s)", (sourceLabel) => {
    expect(documentWorkspaceHref({ ...document, sourceLabel, blockId: "body:1" })).toBe("/create?project=client-space&document=note%2Fone&block=body%3A1");
  });
});
