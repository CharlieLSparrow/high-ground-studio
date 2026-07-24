import {
  filterResearchRecords,
  humanizeResearchStatus,
  type ResearchEvidenceRecord,
  type ResearchPacketRecord,
  type ResearchSourceRecord,
} from "./research-library-model";

const packets: ResearchPacketRecord[] = [{
  id: "packet-1",
  title: "Leadership source packet",
  kind: "research-packet",
  status: "needs_review",
  projectName: "High Ground",
  projectSlug: "high-ground",
  documentTitle: "Episode notes",
  hasLineage: true,
  approvedAt: null,
  updatedAt: "2026-07-18T12:00:00.000Z",
}];

const evidence: ResearchEvidenceRecord[] = [{
  id: "node-1",
  title: "Systems evidence",
  excerpt: "The source describes a calm way to reduce systems anxiety.",
  sourceLabel: "Essay transcript",
  sourcePath: null,
  tagLabel: "Product philosophy",
  nodeType: "source_note",
  reviewStatus: "draft",
  projectionStatus: "projection_not_approved",
  projectName: "Quipsly",
  projectSlug: "quipsly",
  documentTitle: "Philosophy draft",
  updatedAt: "2026-07-18T12:00:00.000Z",
}];

describe("research library model", () => {
  it("searches real packet and evidence provenance fields", () => {
    expect(filterResearchRecords("high ground", [], packets, evidence)).toEqual({
      sources: [],
      packets,
      evidence: [],
    });
    expect(filterResearchRecords("essay transcript", [], packets, evidence)).toEqual({
      sources: [],
      packets: [],
      evidence,
    });
  });

  it("returns the provided records unchanged for an empty query", () => {
    const sources: never[] = [];
    const result = filterResearchRecords("  ", sources, packets, evidence);
    expect(result.sources).toBe(sources);
    expect(result.packets).toBe(packets);
    expect(result.evidence).toBe(evidence);
  });

  it("searches tags actually applied to evidence, not every available project tag", () => {
    const source: ResearchSourceRecord = {
      id: "source-1",
      title: "Interview transcript",
      kind: "transcript",
      author: null,
      sourceUrl: null,
      sourcePath: null,
      immutableText: "Original interview words.",
      contentTruncated: false,
      projectName: "High Ground",
      projectSlug: "high-ground",
      canWrite: true,
      tagCatalog: [
        { id: "tag-unused", label: "Unused taxonomy", slug: "unused-taxonomy" },
        { id: "tag-applied", label: "Episode seed", slug: "episode-seed" },
      ],
      annotations: [{
        id: "annotation-1", kind: "idea", status: "active", visibility: "private", body: "Use this in the opening.", exactText: "Original interview words.", startOffset: 0, endOffset: 25,
        tagLabels: ["Episode seed"], createdByMe: true, updatedAt: "2026-07-18T12:00:00.000Z", writingUses: [],
      }],
      personalCaptureOrigin: null,
      updatedAt: "2026-07-18T12:00:00.000Z",
    };
    expect(filterResearchRecords("unused taxonomy", [source], [], []).sources).toEqual([]);
    expect(filterResearchRecords("episode seed", [source], [], []).sources).toEqual([source]);
  });

  it("renders database status values as readable labels", () => {
    expect(humanizeResearchStatus("needs_review")).toBe("Needs Review");
    expect(humanizeResearchStatus("research-packet")).toBe("Research Packet");
    expect(humanizeResearchStatus(" ")).toBe("Unknown");
  });
});
