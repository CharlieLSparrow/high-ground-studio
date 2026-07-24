import {
  filterCollectionItems,
  sourceLabelForUrl,
  type CollectionItem,
} from "./collections-model";

const items: CollectionItem[] = [
  {
    id: "quote-1",
    itemType: "snippet",
    collectionId: "leadership",
    collectionName: "Leadership",
    title: "Wednesday Rule",
    excerpt: "Leadership is an observable behavior.",
    note: "Use in the next High Ground outline.",
    sourceUrl: "https://example.com/book",
    sourceLabel: "example.com",
    updatedAt: "2026-07-18T12:00:00.000Z",
    lastCapturedAt: "2026-07-18T12:00:00.000Z",
    captureCount: 1,
    captureHistory: [],
    researchFilings: [],
  },
  {
    id: "bookmark-1",
    itemType: "bookmark",
    collectionId: null,
    collectionName: null,
    title: "Source interview",
    excerpt: "Saved bookmark",
    note: null,
    sourceUrl: "https://research.example.org/interview",
    sourceLabel: "research.example.org",
    updatedAt: "2026-07-18T13:00:00.000Z",
    lastCapturedAt: "2026-07-18T13:00:00.000Z",
    captureCount: 1,
    captureHistory: [],
    researchFilings: [],
  },
];

describe("collections model", () => {
  it("filters by real collection membership and unfiled state", () => {
    expect(filterCollectionItems(items, "leadership", "")).toEqual([items[0]]);
    expect(filterCollectionItems(items, "inbox", "")).toEqual([items[1]]);
  });

  it("searches source text, notes, and source labels", () => {
    expect(filterCollectionItems(items, "all", "high ground")).toEqual([items[0]]);
    expect(filterCollectionItems(items, "all", "research.example")).toEqual([items[1]]);
  });

  it("does not invent a source label for missing or malformed URLs", () => {
    expect(sourceLabelForUrl(null)).toBe("No source URL saved");
    expect(sourceLabelForUrl("not a url")).toBe("Source URL needs review");
    expect(sourceLabelForUrl("https://www.example.com/path")).toBe("example.com");
  });
});
