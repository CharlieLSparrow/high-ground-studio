import { buildLibraryEntries, filterLibraryEntries, promotedMediaAssetId } from "./library-model";

describe("source-first Library model", () => {
  it("deduplicates promoted capture media while retaining canonical Session continuation", () => {
    const result = buildLibraryEntries({
      sessions: [{
        id: "room-1", title: "Episode 5", purpose: "PODCAST", status: "ENDED", updatedAt: "2026-07-19T16:00:00Z", project: { name: "High Ground Odyssey", slug: "high-ground" },
        recordingAssets: [{ id: "recording-1", fileName: "episode5.wav", kind: "LOCAL_AUDIO", status: "VERIFIED", localManifestJson: { promotion: { mediaAssetId: "media-promoted" } } }],
        transcriptJobs: [{ id: "job-1", status: "COMPLETED", provider: "deepgram", updatedAt: "2026-07-19T16:00:00Z", _count: { segments: 84 } }],
      }],
      notes: [],
      sources: [], documents: [],
      media: [
        { id: "media-promoted", filename: "episode5.wav", isProxy: false, updatedAt: "2026-07-19T15:00:00Z", projects: [{ id: "project-1", name: "High Ground Odyssey", slug: "high-ground" }] },
        { id: "standalone", filename: "cover.png", mimeType: "image/png", isProxy: false, updatedAt: "2026-07-19T14:00:00Z", projects: [{ id: "project-1", name: "High Ground Odyssey", slug: "high-ground" }] },
      ],
    });
    expect(result.entries.map((entry) => entry.id)).toEqual(["session:room-1", "media:standalone"]);
    expect(result.entries[0]).toMatchObject({ href: "/sessions/room-1", detail: "1 recording · 84 timed transcript segments." });
    expect(result.promotedMediaIds).toEqual(["media-promoted"]);
    expect(result.boundaries).toMatchObject({ immutableSourcesPreserved: true, promotedCaptureMediaDeduplicated: true });
  });

  it("routes preserved sources, episode manuscripts, and legacy saves to their exact owning surfaces", () => {
    const result = buildLibraryEntries({
      sessions: [],
      notes: [{
        id: "note-1",
        title: "Opening thought",
        body: "Let the opening breathe before the first cut.",
        sourceJson: { schema: "quipsly-mobile-quick-entry-v1", surface: "ios-capture" },
        createdAt: "2026-07-19T12:30:00Z",
        updatedAt: "2026-07-19T12:30:00Z",
        room: { id: "room-1", title: "Episode 5", project: { name: "High Ground", slug: "high-ground" } },
        tags: [{ id: "tag-1", label: "Opening", slug: "opening" }],
      }],
      sources: [{ id: "source-1", title: "Leadership transcript", kind: "transcript", updatedAt: "2026-07-19T12:00:00Z", project: { name: "High Ground", slug: "high-ground" }, annotations: [{ id: "a1", kind: "quote", body: "Use this", exactText: "Leadership is learnable", visibility: "private" }] }],
      documents: [{ id: "doc-1", title: "Episode 5 manuscript", projectionStatus: "private", updatedAt: "2026-07-19T11:00:00Z", project: { name: "High Ground", slug: "high-ground" }, episodeProductions: [{ slug: "episode-5", title: "Episode 5", status: "draft" }], _count: { blocks: 12 } }],
      media: [],
      saved: { collectionCount: 2, snippetCount: 3, bookmarkCount: 4, updatedAt: "2026-07-19T10:00:00Z" },
    });
    expect(result.entries.map((entry) => [entry.kind, entry.href])).toEqual([
      ["NOTE", "/sessions/room-1?mode=notes#session-note-note-1"],
      ["SOURCE", "/research?source=source-1"],
      ["DOCUMENT", "/read?projectSlug=high-ground&episodeSlug=episode-5"],
      ["SAVED", "/collections"],
    ]);
    expect(filterLibraryEntries(result.entries, { query: "#opening", kind: "note" }).map((entry) => entry.id)).toEqual(["note:note-1"]);
    expect(filterLibraryEntries(result.entries, { query: "leadership is learnable", kind: "source" }).map((entry) => entry.id)).toEqual(["source:source-1"]);
  });

  it("projects document-kernel notes as searchable Notes with exact block continuation", () => {
    const result = buildLibraryEntries({
      sessions: [],
      notes: [],
      sources: [],
      documents: [{
        id: "doc-note",
        title: "Coaching reflection",
        sourceLabel: "document-kind:note",
        projectionStatus: "private",
        updatedAt: "2026-07-19T13:00:00Z",
        project: { name: "Home Nest", slug: "home-person" },
        blocks: [
          { id: "block-title", title: "Note Title", body: "Coaching reflection" },
          { id: "block-insight", body: "Protect one honest editing block before Thursday." },
        ],
        episodeProductions: [],
        _count: { blocks: 2 },
      }],
      media: [],
    });

    expect(result.entries[0]).toMatchObject({
      id: "document:doc-note",
      kind: "NOTE",
      detail: "Protect one honest editing block before Thursday.",
      href: "/create?project=home-person&document=doc-note&block=block-insight",
      stateLabel: "Note",
      badges: ["Writing", "2 sections"],
    });
    expect(result.counts).toMatchObject({ notes: 1, documents: 0 });
    expect(filterLibraryEntries(result.entries, { query: "honest editing", kind: "note" })).toHaveLength(1);
  });

  it("opens iPhone voice writing in the focused cross-device editor", () => {
    const result = buildLibraryEntries({
      viewerUserId: "homer-user",
      sessions: [],
      notes: [],
      sources: [],
      documents: [{
        id: "voice-writing-7a9b10f0-97bd-4bbb-a7dd-0b93fbc5918b",
        title: "Dissertation reflection",
        sourceLabel: "document-kind:note;origin:ios-voice-writing",
        personalOwnerUserId: "homer-user",
        isPrivate: true,
        projectionStatus: "private",
        updatedAt: "2026-08-27T18:00:00Z",
        project: { name: "Homer's Nest", slug: "home-homer" },
        blocks: [
          { id: "voice-title", title: "Note Title", body: "Dissertation reflection" },
          { id: "voice-body", body: "Start with the story I told aloud." },
        ],
        episodeProductions: [],
        _count: { blocks: 2 },
      }],
      media: [],
    });

    expect(result.entries[0]).toMatchObject({
      kind: "DOCUMENT",
      href: "/writing/7a9b10f0-97bd-4bbb-a7dd-0b93fbc5918b",
      actionLabel: "Continue writing",
      stateLabel: "Writing",
      badges: ["From iPhone"],
    });
    expect(result.counts).toMatchObject({ notes: 0, documents: 1 });
  });

  it("opens a collaborator's shared iPhone writing in the ordinary Nest editor", () => {
    const result = buildLibraryEntries({
      viewerUserId: "collaborator-user",
      sessions: [],
      notes: [],
      sources: [],
      documents: [{
        id: "voice-writing-7a9b10f0-97bd-4bbb-a7dd-0b93fbc5918b",
        title: "Shared research reflection",
        sourceLabel: "document-kind:note;origin:ios-voice-writing",
        personalOwnerUserId: "homer-user",
        isPrivate: false,
        projectionStatus: "draft",
        updatedAt: "2026-08-27T18:00:00Z",
        project: { name: "Research Lab", slug: "research-lab" },
        blocks: [{ id: "voice-body", body: "A shared thought." }],
        episodeProductions: [],
        _count: { blocks: 1 },
      }],
      media: [],
    });

    expect(result.entries[0]).toMatchObject({
      href: "/create?project=research-lab&document=voice-writing-7a9b10f0-97bd-4bbb-a7dd-0b93fbc5918b&block=voice-body",
      actionLabel: "Continue writing",
      stateLabel: "Shared writing",
      badges: ["From iPhone", "Nest members"],
    });
  });

  it("never presents a legacy Session purpose as the writing title", () => {
    const result = buildLibraryEntries({
      viewerUserId: "homer-user",
      sessions: [],
      notes: [],
      sources: [],
      documents: [{
        id: "voice-writing-7a9b10f0-97bd-4bbb-a7dd-0b93fbc5918b",
        title: "PERSONAL_NOTE",
        sourceLabel: "document-kind:note;origin:ios-voice-writing",
        personalOwnerUserId: "homer-user",
        isPrivate: true,
        projectionStatus: "private",
        updatedAt: "2026-08-27T18:00:00Z",
        project: { name: "Homer's Nest", slug: "home-homer" },
        blocks: [{
          id: "voice-body",
          body: "A practical framework for calmer coaching conversations starts here.",
        }],
        episodeProductions: [],
        _count: { blocks: 1 },
      }],
      media: [],
    });

    expect(result.entries[0]).toMatchObject({
      title: "A practical framework for calmer coaching conversations starts here",
      actionLabel: "Continue writing",
    });
  });

  it("fails closed when a promotion manifest is malformed", () => {
    expect(promotedMediaAssetId(null)).toBeNull();
    expect(promotedMediaAssetId({ promotion: { mediaAssetId: "" } })).toBeNull();
    expect(promotedMediaAssetId({ promotion: { mediaAssetId: "media-1" } })).toBe("media-1");
  });
});
