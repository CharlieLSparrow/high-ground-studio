import {
  describeArtifactEvidence,
  describeAttemptStatus,
  describePacketReadiness,
  lineageKeys,
  normalizeRecordedPublicUrl,
  type PublishingArtifactRecord,
} from "./publishing-model";

function artifact(overrides: Partial<PublishingArtifactRecord> = {}): PublishingArtifactRecord {
  return {
    id: "artifact-1",
    projectId: "project-1",
    outputPacketId: "packet-1",
    projectName: "High Ground Odyssey",
    projectSlug: "high-ground-odyssey",
    destination: "youtube",
    status: "published",
    externalId: null,
    publicUrl: null,
    publicUrlHost: null,
    publishedAt: null,
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("publishing evidence model", () => {
  it("accepts only HTTP(S) public URLs", () => {
    expect(normalizeRecordedPublicUrl("https://example.com/watch/123")).toEqual({
      url: "https://example.com/watch/123",
      host: "example.com",
    });
    expect(normalizeRecordedPublicUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeRecordedPublicUrl("file:///private/output.mov")).toBeNull();
    expect(normalizeRecordedPublicUrl("not a URL")).toBeNull();
  });

  it("does not turn a ready packet status into approval or publication", () => {
    expect(describePacketReadiness("ready", null, null)).toEqual({
      label: "Packet marked ready",
      detail: "The stored packet status says it is ready for review or handoff. No approval timestamp is recorded.",
      tone: "warning",
    });
    expect(describePacketReadiness("approved", null, null).label).toBe("Stored packet state");
    expect(describePacketReadiness(
      "approved",
      "2026-07-18T12:00:00.000Z",
      "producer@example.com",
    )).toMatchObject({
      label: "Approval recorded",
      tone: "positive",
    });
  });

  it("keeps completed attempts separate from artifact evidence", () => {
    expect(describeAttemptStatus("completed")).toMatchObject({
      label: "Attempt completed",
      tone: "positive",
    });
    expect(describeAttemptStatus("completed").detail).toMatch(/still requires an artifact receipt/i);
  });

  it("describes only evidence present on an artifact receipt", () => {
    expect(describeArtifactEvidence(artifact()).label).toBe("Artifact row recorded");
    expect(describeArtifactEvidence(artifact({ externalId: "provider-123" })).label).toBe("Provider artifact ID recorded");
    expect(describeArtifactEvidence(artifact({ publishedAt: "2026-07-18T12:00:00.000Z" })).label).toBe("Publication timestamp recorded");
    expect(describeArtifactEvidence(artifact({
      publicUrl: "https://example.com/watch/123",
      publicUrlHost: "example.com",
    }))).toMatchObject({
      label: "Recorded public URL",
      tone: "positive",
    });
  });

  it("shows bounded lineage keys without exposing values", () => {
    expect(lineageKeys({ sourceDocumentId: "private-id", timelineVersion: 4 })).toEqual([
      "sourceDocumentId",
      "timelineVersion",
    ]);
    expect(lineageKeys(["not", "an", "object"])).toEqual([]);
  });
});
