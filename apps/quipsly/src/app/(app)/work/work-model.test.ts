import { buildWorkSnapshot, isActiveSessionGoal, sharedWorkRoomIds, taskProvenance } from "./work-model";

const now = "2026-07-18T18:00:00.000Z";

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Send the episode outline",
    detail: null,
    status: "OPEN" as const,
    dueAt: "2026-07-17T18:00:00.000Z",
    completedAt: null,
    createdAt: "2026-07-16T18:00:00.000Z",
    updatedAt: "2026-07-17T18:00:00.000Z",
    sourceJson: {},
    room: { id: "room-1", title: "Episode 5 prep", status: "ENDED", nestSlug: "high-ground", projectSlug: null },
    booking: null,
    assignedUser: null,
    ...overrides,
  };
}

describe("Work Queue model", () => {
  it("shares unbooked production work without leaking booking-backed coaching work to generic room participants", () => {
    expect(sharedWorkRoomIds([
      { id: "episode-room", bookingId: null },
      { id: "coaching-room", bookingId: "private-booking" },
      { id: "legacy-production-room" },
    ])).toEqual(["episode-room", "legacy-production-room"]);
  });

  it("projects another person's weekly review only for the explicitly assigned reviewer", () => {
    const commitment = {
      id: "client-week",
      clientUserId: "client-1",
      weekStartsAt: "2026-07-13T12:00:00.000Z",
      commitmentOne: "Private client promise",
      status: "ACTIVE" as const,
      updatedAt: now,
      clientUser: { name: "Private Client", primaryEmail: "client@example.test" },
    };
    const denied = buildWorkSnapshot({ now, actorUserId: "coach-1", tasks: [], goals: [], canonicalGoals: [], commitments: [commitment], planBlocks: [] });
    expect(denied.weeklyReviews).toHaveLength(1);
    expect(denied.weeklyReviews[0].relationship).toBe("self");

    const allowed = buildWorkSnapshot({ now, actorUserId: "coach-1", tasks: [], goals: [], canonicalGoals: [], commitments: [{ ...commitment, reviewedByUserId: "coach-1" }], planBlocks: [] });
    expect(allowed.weeklyReviews.map((review) => review.relationship)).toEqual(["self", "coach-review"]);
  });

  it("promotes only a complete room-matched transcript receipt into an exact source anchor", () => {
    const sourceJson = {
      schema: "quipsly-transcript-derived-task-v1",
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      startSeconds: 3.66,
      endSeconds: 4.84,
      providerTextSha256: "a".repeat(64),
      providerSpeakerLabel: "Speaker",
      effectiveTextSnapshot: "Welcome, everybody.",
      effectiveSpeakerLabelSnapshot: "Charlie",
      acceptedCorrectionId: "correction-1",
      recordingAssetId: "asset-1",
      playbackSourceId: "source-1",
    };
    const snapshot = buildWorkSnapshot({ now, tasks: [task({ sourceJson })], goals: [], commitments: [] });
    expect(snapshot.tasks[0]).toMatchObject({
      provenance: "Reviewed transcript timestamp",
      attentionReason: "Overdue commitment",
      sourceAnchor: { segmentId: "segment-1", startSeconds: 3.66, recordingAssetId: "asset-1" },
    });
    const mismatch = buildWorkSnapshot({ now, tasks: [task({ sourceJson: { ...sourceJson, roomId: "other-room" } })], goals: [], commitments: [] });
    expect(mismatch.tasks[0].sourceAnchor).toBeNull();
  });

  it("derives attention from deadlines and recent reviewed transcript work without an unread ledger", () => {
    const transcriptSource = {
      schema: "quipsly-transcript-derived-task-v1",
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      startSeconds: 3,
      endSeconds: 4,
      providerTextSha256: "a".repeat(64),
      effectiveTextSnapshot: "Follow through.",
      recordingAssetId: "asset-1",
      playbackSourceId: "source-1",
    };
    const snapshot = buildWorkSnapshot({
      now,
      tasks: [
        task({ id: "overdue" }),
        task({ id: "soon", dueAt: "2026-07-19T12:00:00.000Z" }),
        task({ id: "later", dueAt: "2026-07-22T12:00:00.000Z" }),
        task({ id: "reviewed", dueAt: null, createdAt: "2026-07-18T12:00:00.000Z", sourceJson: transcriptSource }),
      ],
      goals: [],
      commitments: [],
    });
    expect(snapshot.tasks.map((item) => [item.id, item.attentionReason])).toEqual([
      ["overdue", "Overdue commitment"],
      ["soon", "Due within 24 hours"],
      ["later", null],
      ["reviewed", "Reviewed transcript follow-through"],
    ]);
    expect(snapshot.counts.attentionTasks).toBe(3);
  });

  it("projects only active canonical reminder intents", () => {
    const snapshot = buildWorkSnapshot({
      now,
      tasks: [
        task({ id: "active", reminder: { id: "reminder-active", remindAt: "2026-07-19T12:00:00.000Z", status: "ACTIVE", updatedAt: now } }),
        task({ id: "canceled", reminder: { id: "reminder-canceled", remindAt: "2026-07-19T13:00:00.000Z", status: "CANCELED", updatedAt: now } }),
      ],
      goals: [],
      commitments: [],
    });

    expect(snapshot.tasks.find((item) => item.id === "active")?.reminderAt).toBe("2026-07-19T12:00:00.000Z");
    expect(snapshot.tasks.find((item) => item.id === "active")).toMatchObject({
      reminderId: "reminder-active",
      reminderStatus: "ACTIVE",
      reminderUpdatedAt: now,
    });
    expect(snapshot.tasks.find((item) => item.id === "canceled")?.reminderAt).toBeNull();
  });

  it("allows only the assigned owner to edit an open, one-time canonical task", () => {
    const snapshot = buildWorkSnapshot({
      now,
      actorUserId: "user-1",
      tasks: [
        task({ id: "editable", assignedUserId: "user-1" }),
        task({ id: "other-owner", assignedUserId: "user-2" }),
        task({ id: "closed", assignedUserId: "user-1", status: "DONE" }),
        task({
          id: "recurring",
          assignedUserId: "user-1",
          recurrenceOccurrence: {
            occurrenceKey: "2026-07-17T09:00[America/Denver]",
            scheduledLocalDate: "2026-07-17",
            series: {
              id: "series-1",
              cadence: "FIXED",
              frequency: "WEEKLY",
              interval: 1,
              timezone: "America/Denver",
              localTimeMinutes: 540,
              status: "ACTIVE",
              updatedAt: now,
            },
          },
        }),
      ],
      goals: [],
      commitments: [],
    });
    const editability = Object.fromEntries(snapshot.tasks.map((item) => [item.id, item.canEdit]));
    expect(editability).toEqual({
      editable: true,
      "other-owner": false,
      recurring: false,
      closed: false,
    });
  });

  it("quarantines inferred transcript candidates while retaining accepted work", () => {
    const snapshot = buildWorkSnapshot({
      now,
      tasks: [
        task({ id: "candidate", sourceJson: { source: "transcript-packet-builder", candidate: true } }),
        task({ id: "accepted", sourceJson: { source: "transcript-packet-builder", candidate: false, humanAccepted: true } }),
      ],
      goals: [],
      commitments: [],
    });

    expect(snapshot.tasks.map((item) => item.id)).toEqual(["accepted"]);
    expect(snapshot.tasks[0]).toMatchObject({ provenance: "Accepted transcript proposal", isOverdue: true, assigneeLabel: null });
  });

  it("recognizes only active, source-bound session goals", () => {
    const source = { source: "quipsly-capture-session-context-v2", contextKind: "goal", contextEntryId: "goal-entry", active: true };
    expect(isActiveSessionGoal({ sourceJson: source })).toBe(true);
    expect(isActiveSessionGoal({ sourceJson: { ...source, contextKind: "quick-note" } })).toBe(false);
    expect(isActiveSessionGoal({ sourceJson: { ...source, active: false } })).toBe(false);

    const snapshot = buildWorkSnapshot({
      now,
      tasks: [],
      goals: [
        { id: "goal-1", title: "Session goal", body: "Make the coaching recap useful", sourceJson: source, createdAt: now, updatedAt: now, room: { id: "room-1", title: "Coaching review" } },
        { id: "note-1", title: "Quick note", body: "Not a goal", sourceJson: { ...source, contextKind: "quick-note" }, createdAt: now, updatedAt: now },
      ],
      commitments: [],
    });
    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.counts.activeGoals).toBe(1);
  });

  it("prefers canonical goals over their legacy note projection and keeps progress evidence", () => {
    const source = { source: "quipsly-capture-session-context-v2", contextKind: "goal", contextEntryId: "goal-entry", active: true };
    const snapshot = buildWorkSnapshot({
      now,
      tasks: [],
      goals: [{ id: "legacy-note", title: "Session goal", body: "Ship the useful recap", sourceJson: source, createdAt: now, updatedAt: now }],
      canonicalGoals: [{
        id: "canonical-goal",
        title: "Ship the useful recap",
        description: "The client can act without reconstructing the call.",
        status: "ACTIVE",
        targetAt: "2026-07-25T12:00:00.000Z",
        sourceJson: source,
        createdAt: now,
        updatedAt: now,
        progressReceipts: [
          {
            id: "merge-progress-1",
            kind: "TRANSCRIPT_CANDIDATE_MERGED",
            progressPercent: null,
            note: "Reviewed evidence",
            occurredAt: now,
            evidenceJson: {
              schema: "quipsly-transcript-goal-evidence-merge-v1",
              receiptId: "packet-receipt-1",
              goalCandidateId: "packet-goal-build-segment-1",
              mergedAt: now,
              candidateSource: {
                schema: "quipsly-transcript-derived-goal-v1",
                roomId: "room-1",
                transcriptJobId: "job-1",
                segmentId: "segment-1",
                startSeconds: 3.66,
                endSeconds: 4.84,
                providerTextSha256: "a".repeat(64),
                providerSpeakerLabel: "Speaker",
                effectiveTextSnapshot: "The client chose the next move in their own words.",
                effectiveSpeakerLabelSnapshot: "Client",
                acceptedCorrectionId: null,
                recordingAssetId: "asset-1",
                playbackSourceId: "source-1",
              },
            },
          },
          { progressPercent: 50, note: "Draft is source-linked", occurredAt: now },
        ],
        taskLinks: [{ relationship: "CONTRIBUTES", actionItem: { id: "task-1", title: "Review transcript", status: "OPEN" } }],
        _count: { children: 1 },
      }],
      commitments: [],
    });
    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.goals[0]).toMatchObject({
      id: "canonical-goal",
      provenance: "Canonical goal",
      progressPercent: 50,
      progressNote: "Draft is source-linked",
      lastMergedTranscriptEvidence: {
        receiptId: "packet-receipt-1",
        goalCandidateId: "packet-goal-build-segment-1",
        sourceAnchor: {
          roomId: "room-1",
          segmentId: "segment-1",
          effectiveTextSnapshot: "The client chose the next move in their own words.",
        },
      },
      childCount: 1,
      linkedTasks: [{ relationship: "CONTRIBUTES", task: { id: "task-1" } }],
    });
  });

  it("marks a restored portable goal as a distinct retained copy", () => {
    const snapshot = buildWorkSnapshot({
      now,
      tasks: [],
      goals: [],
      canonicalGoals: [{
        id: "portable-goal-1",
        title: "Prove one complete Capture-to-Nest episode loop",
        description: "Preserved recovery evidence.",
        status: "ACTIVE",
        sourceJson: {
          schema: "quipsly-portable-goal-restore-v1",
          manifestSha256: "a".repeat(64),
          originalGoalId: "goal-1",
        },
        createdAt: now,
        updatedAt: now,
      }],
      commitments: [],
    });

    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.goals[0]).toMatchObject({
      id: "portable-goal-1",
      provenance: "Canonical goal",
      restoredFromPortableBackup: true,
    });
  });

  it("returns a canonical goal to its exact room-matched transcript source", () => {
    const sourceJson = {
      schema: "quipsly-transcript-derived-goal-v1",
      roomId: "room-1",
      transcriptJobId: "job-1",
      segmentId: "segment-1",
      startSeconds: 12.4,
      endSeconds: 17.8,
      providerTextSha256: "b".repeat(64),
      providerSpeakerLabel: "Speaker",
      effectiveTextSnapshot: "Build a repeatable coaching review habit.",
      effectiveSpeakerLabelSnapshot: "Homer",
      acceptedCorrectionId: "correction-1",
      recordingAssetId: "asset-1",
      playbackSourceId: "source-1",
    };
    const canonicalGoal = {
      id: "goal-source",
      title: "Build the review habit",
      status: "ACTIVE" as const,
      sourceJson,
      createdAt: now,
      updatedAt: now,
      room: { id: "room-1", title: "Coaching review" },
    };
    const snapshot = buildWorkSnapshot({ now, tasks: [], goals: [], canonicalGoals: [canonicalGoal], commitments: [] });
    expect(snapshot.goals[0]).toMatchObject({
      roomId: "room-1",
      sourceAnchor: { schema: "quipsly-transcript-derived-goal-v1", segmentId: "segment-1", startSeconds: 12.4 },
    });
    const mismatch = buildWorkSnapshot({
      now,
      tasks: [],
      goals: [],
      canonicalGoals: [{ ...canonicalGoal, room: { id: "other-room", title: "Other" } }],
      commitments: [],
    });
    expect(mismatch.goals[0].sourceAnchor).toBeNull();
  });

  it("expands the three weekly commitment slots without blank placeholders", () => {
    const snapshot = buildWorkSnapshot({
      now,
      actorUserId: "user-1",
      tasks: [],
      goals: [],
      commitments: [{
        id: "week-1",
        clientUserId: "user-1",
        weekStartsAt: "2026-07-13T00:00:00.000Z",
        commitmentOne: "Draft the episode",
        commitmentTwo: " ",
        commitmentThree: "Review the coaching notes",
        status: "ACTIVE",
        updatedAt: now,
      }],
    });
    expect(snapshot.commitments[0].commitments).toEqual(["Draft the episode", "Review the coaching notes"]);
    expect(snapshot.commitments[0].isOwnedByActor).toBe(true);
    expect(snapshot.counts.activeCommitments).toBe(1);
  });

  it("labels source provenance without claiming delivery or ownership", () => {
    expect(taskProvenance({ source: "quipsly-capture-session-context-v2", contextKind: "task" })).toBe("Session context");
    expect(taskProvenance({ materializationSource: "transcript-action-candidate-acceptance" })).toBe("Accepted transcript proposal");
    expect(taskProvenance({})).toBe("Manual or legacy task");
  });
});
