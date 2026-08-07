/** @jest-environment node */

import {
  createPortableNestBundle,
  LEGACY_NEST_EXPORT_SCHEMA_VERSION,
  nestManifestSha256,
  NEST_EXPORT_SCHEMA_VERSION,
  type PortableNestBundlePayload,
  validateNestBundle,
} from "./nest-portability";

function payload(): PortableNestBundlePayload {
  const createdAt = "2026-07-24T20:00:00.000Z";
  return {
    schemaVersion: NEST_EXPORT_SCHEMA_VERSION,
    exportedAt: "2026-07-24T21:00:00.000Z",
    sourceNest: {
      id: "source-project",
      slug: "source-nest",
      name: "Source Nest",
      description: "Portable test",
      sourceLabel: "nest-kind:writing",
      updatedAt: createdAt,
    },
    tags: [
      {
        id: "tag-1",
        slug: "proof-listen",
        label: "Proof listen",
        description: null,
        category: "review",
        nodeType: "source_note",
        isPrivate: true,
        isActive: true,
        archivedAt: null,
        mergedIntoTagId: null,
        aliases: [
          {
            id: "alias-1",
            slug: "proofing",
            label: "Proofing",
            provenanceJson: { source: "human rename" },
            createdAt,
          },
        ],
        revisions: [
          {
            revision: 1,
            operation: "created",
            snapshotJson: { label: "Proof listen" },
            createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    notes: [
      {
        id: "note-1",
        stableId: "note-stable-1",
        title: "Episode proof note",
        sourceLabel: "document-kind:note",
        sourcePath: null,
        projectionStatus: "private",
        isPrivate: true,
        personal: true,
        tagIds: ["tag-1"],
        blocks: [
          {
            id: "block-1",
            stableId: "block-stable-1",
            order: 0,
            title: null,
            body: "Listen to the full episode.",
            sourceLabel: "document-kind:note",
            sourcePath: null,
            externalId: null,
            projectionStatus: "private",
            isPrivate: true,
            archivedAt: null,
            spans: [
              {
                id: "span-1",
                tagId: "tag-1",
                startOffset: 0,
                endOffset: 6,
                selectedText: "Listen",
                noteBody: null,
                createdAt,
              },
            ],
            createdAt,
            updatedAt: createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "Proof-listen Episode 8",
        detail: "Use headphones.",
        status: "OPEN",
        dueAt: "2026-07-25T18:00:00.000Z",
        completedAt: null,
        sourceJson: { source: "manual" },
        tagIds: ["tag-1"],
        reminderSnapshot: {
          id: "reminder-1",
          remindAt: "2026-07-25T17:00:00.000Z",
          status: "ACTIVE",
          sourceJson: { requestedBy: "person" },
          updatedAt: createdAt,
        },
        recurrenceSnapshot: null,
        evidenceReceipts: [
          {
            id: "task-evidence-1",
            kind: "TRANSCRIPT_CANDIDATE_MERGED",
            note: "Reviewed against source playback.",
            evidenceJson: {
              schema: "quipsly-transcript-task-evidence-merge-v1",
            },
            occurredAt: "2026-07-24T19:00:00.000Z",
            createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    goals: [
      {
        id: "goal-1",
        parentGoalId: null,
        title: "Publish Episode 8",
        description: "Finish a human proof-listen.",
        status: "ACTIVE",
        targetAt: "2026-07-26T18:00:00.000Z",
        achievedAt: null,
        sourceJson: { source: "manual" },
        tagIds: ["tag-1"],
        progressReceipts: [
          {
            id: "progress-1",
            kind: "check-in",
            progressPercent: 25,
            note: "Rough cut ready.",
            evidenceJson: { reviewed: true },
            occurredAt: createdAt,
            createdAt,
          },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    goalTaskLinks: [
      {
        goalId: "goal-1",
        taskId: "task-1",
        relationship: "CONTRIBUTES",
        sourceJson: { explicit: true },
        createdAt,
      },
    ],
    planBlocks: [
      {
        id: "plan-1",
        taskId: "task-1",
        goalId: null,
        startsAt: "2026-07-25T19:00:00.000Z",
        endsAt: "2026-07-25T19:50:00.000Z",
        timezone: "America/Denver",
        status: "PLANNED",
        completedAt: null,
        actualMinutes: null,
        sourceJson: { source: "personal planning" },
        createdAt,
        updatedAt: createdAt,
      },
    ],
    sourceStory: {
      sourceRevisions: [],
      sourceSets: [],
      sourceRanges: [],
      cards: [],
      boards: [],
    },
    boundaries: {
      ownerAuthorized: true,
      actorScopedWork: true,
      noteDocumentsIncluded: true,
      mediaBytesIncluded: false,
      sessionsIncluded: false,
      collaboratorAssignmentsIncluded: false,
      remindersRestoredActive: false,
      recurrenceRestoredActive: false,
      planBlocksRestoreAsCanceled: true,
      sourceStoryIncluded: true,
      sourceReferenceMetadataIncluded: true,
      restoredSourceReferencesAvailable: false,
      providerCredentialsIncluded: false,
      providerLocatorsIncluded: false,
      externalResourcesFetched: false,
      externalSideEffects: false,
    },
  };
}

describe("portable Nest bundle validation", () => {
  it("accepts a complete project note, work graph, taxonomy, and safety manifest", () => {
    expect(
      validateNestBundle(createPortableNestBundle(payload())),
    ).toMatchObject({
      ok: true,
      bundle: {
        sourceNest: { id: "source-project", slug: "source-nest" },
        tags: [{ id: "tag-1", aliases: [{ slug: "proofing" }] }],
        notes: [
          { id: "note-1", blocks: [{ spans: [{ selectedText: "Listen" }] }] },
        ],
        tasks: [{ id: "task-1", reminderSnapshot: { status: "ACTIVE" } }],
        goals: [{ id: "goal-1", progressReceipts: [{ progressPercent: 25 }] }],
        goalTaskLinks: [{ relationship: "CONTRIBUTES" }],
        planBlocks: [{ id: "plan-1" }],
        manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
  });

  it("rejects bytes changed after the manifest was created", () => {
    const bundle = createPortableNestBundle(payload());
    bundle.tasks[0].title = "Changed after download";
    expect(validateNestBundle(bundle)).toEqual({
      ok: false,
      error:
        "The Nest bundle manifest does not match its contents. Nothing was restored.",
    });
  });

  it("accepts exact source metadata, an immutable range, a tagged card, and a writing-linked board", () => {
    const changed = payload();
    changed.sourceStory = {
      sourceRevisions: [
        {
          id: "source-revision-1",
          revisionKey: "drive-revision-1",
          identitySha256: "b".repeat(64),
          contentSha256: "c".repeat(64),
          sizeBytes: "102420828",
          durationSeconds: 81.76,
          widthPixels: 1920,
          heightPixels: 960,
          framesPerSecond: 29.97,
          mediaProjection: "equirectangular",
          sourceState: "available",
          providerModifiedAt: null,
          verifiedAt: "2026-07-24T20:00:00.000Z",
          createdAt: "2026-07-24T20:00:00.000Z",
        },
      ],
      sourceSets: [],
      sourceRanges: [
        {
          id: "source-range-1",
          sourceRevisionId: "source-revision-1",
          sourceSetId: null,
          selectorSha256: "d".repeat(64),
          startSeconds: 12.25,
          endSeconds: 24.5,
          selectorJson: { schema: "quipsly-source-range-v1" },
          reframeRecipeJson: null,
          createdAt: "2026-07-24T20:00:00.000Z",
        },
      ],
      cards: [
        {
          id: "story-card-1",
          stableId: "story-card-stable-1",
          sourceRangeId: "source-range-1",
          title: "Lakeside reveal",
          synopsis: "Opening visual",
          notes: "Check the horizon.",
          purpose: "opening",
          status: "selected",
          visibility: "project",
          revision: 1,
          archivedAt: null,
          tagIds: ["tag-1"],
          revisions: [],
          createdAt: "2026-07-24T20:00:00.000Z",
          updatedAt: "2026-07-24T20:00:00.000Z",
        },
      ],
      boards: [
        {
          id: "story-board-1",
          slug: "episode-open",
          title: "Episode Open",
          description: null,
          kind: "episode",
          layout: "board",
          revision: 1,
          archivedAt: null,
          sections: [
            {
              id: "story-section-1",
              key: "episode-open",
              title: "Episode Open",
              synopsis: "Establish place.",
              sortOrder: 0,
              documentId: "note-1",
              revision: 1,
              archivedAt: null,
              operations: [],
              createdAt: "2026-07-24T20:00:00.000Z",
              updatedAt: "2026-07-24T20:00:00.000Z",
            },
          ],
          placements: [
            {
              id: "story-placement-1",
              cardId: "story-card-1",
              groupKey: "episode-open",
              laneKey: "b-roll",
              sortOrder: 0,
              createdAt: "2026-07-24T20:00:00.000Z",
              updatedAt: "2026-07-24T20:00:00.000Z",
            },
          ],
          operations: [],
          createdAt: "2026-07-24T20:00:00.000Z",
          updatedAt: "2026-07-24T20:00:00.000Z",
        },
      ],
    };
    expect(validateNestBundle(createPortableNestBundle(changed))).toMatchObject(
      {
        ok: true,
        bundle: {
          sourceStory: {
            sourceRanges: [
              { id: "source-range-1", startSeconds: 12.25, endSeconds: 24.5 },
            ],
            cards: [{ id: "story-card-1", tagIds: ["tag-1"] }],
            boards: [
              { id: "story-board-1", sections: [{ documentId: "note-1" }] },
            ],
          },
        },
      },
    );

    changed.sourceStory.boards[0].sections[0].documentId = "missing-writing";
    expect(validateNestBundle(createPortableNestBundle(changed))).toEqual({
      ok: false,
      error:
        "A Source Story section is incomplete, repeated, or points to missing writing.",
    });
  });

  it("continues to validate an intact v1 package as an empty Source Story extension", () => {
    const current = createPortableNestBundle(payload());
    const {
      sourceStory: _sourceStory,
      schemaVersion: _schemaVersion,
      boundaries,
      integrity,
      ...rest
    } = current;
    const legacyBoundaries = { ...boundaries } as Record<string, unknown>;
    delete legacyBoundaries.sourceStoryIncluded;
    delete legacyBoundaries.sourceReferenceMetadataIncluded;
    delete legacyBoundaries.restoredSourceReferencesAvailable;
    delete legacyBoundaries.providerCredentialsIncluded;
    delete legacyBoundaries.providerLocatorsIncluded;
    const legacyPayload = {
      ...rest,
      schemaVersion: LEGACY_NEST_EXPORT_SCHEMA_VERSION,
      boundaries: legacyBoundaries,
    };
    const legacyIntegrity = { ...integrity } as Record<string, unknown>;
    for (const key of [
      "sourceRevisionCount",
      "sourceSetCount",
      "sourceSetMemberCount",
      "sourceRangeCount",
      "storyCardCount",
      "storyCardRevisionCount",
      "storyBoardCount",
      "storySectionCount",
      "storyPlacementCount",
      "storyOperationCount",
    ])
      delete legacyIntegrity[key];
    legacyIntegrity.manifestSha256 = nestManifestSha256(legacyPayload as never);
    const legacyBundle = { ...legacyPayload, integrity: legacyIntegrity };
    expect(validateNestBundle(legacyBundle)).toMatchObject({
      ok: true,
      bundle: {
        schemaVersion: LEGACY_NEST_EXPORT_SCHEMA_VERSION,
        sourceStory: { cards: [], boards: [] },
        boundaries: { sourceStoryIncluded: false },
      },
    });
  });

  it("fails legacy private notes closed to the importing actor", () => {
    const legacyPayload = payload() as any;
    delete legacyPayload.notes[0].personal;

    expect(
      validateNestBundle(createPortableNestBundle(legacyPayload)),
    ).toMatchObject({
      ok: true,
      bundle: {
        notes: [{ id: "note-1", personal: true }],
      },
    });
  });

  it("rejects a recomputed package whose note anchor no longer matches its exact text", () => {
    const changed = payload();
    changed.notes[0].blocks[0].spans[0].selectedText = "Wrong";
    expect(validateNestBundle(createPortableNestBundle(changed))).toEqual({
      ok: false,
      error: "A note tag anchor no longer matches its block or vocabulary.",
    });
  });

  it("rejects task-goal and focus-block references outside the exported graph", () => {
    const changed = payload();
    changed.goalTaskLinks[0].taskId = "missing-task";
    expect(validateNestBundle(createPortableNestBundle(changed))).toEqual({
      ok: false,
      error: "A goal-task link points outside the exported work graph.",
    });
  });

  it("rejects a package that claims reminders or external effects will be activated", () => {
    const changed = payload();
    changed.boundaries.remindersRestoredActive = true as false;
    expect(validateNestBundle(createPortableNestBundle(changed))).toEqual({
      ok: false,
      error: "The Nest bundle safety boundaries are missing or unsupported.",
    });
  });

  it("rejects recomputed packages with duplicate nested persistence identities", () => {
    const changed = payload();
    changed.goals.push({
      ...changed.goals[0],
      id: "goal-2",
      title: "A second goal",
      tagIds: [],
      progressReceipts: [{ ...changed.goals[0].progressReceipts[0] }],
    });
    expect(validateNestBundle(createPortableNestBundle(changed))).toEqual({
      ok: false,
      error: "The Nest bundle repeats a goal progress-receipt identity.",
    });
  });
});
