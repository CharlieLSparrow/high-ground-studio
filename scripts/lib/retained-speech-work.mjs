import assert from "node:assert/strict";

// Identify rehearsal work by its generation source, not its editable title.
// A retained fixture is deliberately used for real editing between recordings.
export function selectRetainedSpeechWork({ tasks, goals }) {
  const title = (row) => row.sourceJson?.generatedSnapshot?.title ?? row.title;
  return {
    tasks: tasks.filter((row) => /draft one page/i.test(title(row))),
    goals: goals.filter((row) => /^My coaching goal is to write/i.test(title(row))),
  };
}

function editableWork(row, kind) {
  return {
    id: row.id,
    title: row.title,
    body: kind === "task" ? row.detail : row.description,
    status: row.status,
    owner: kind === "task" ? row.assignedUserId : row.ownerUserId,
    date: kind === "task" ? row.dueAt : row.targetAt,
    engagementId: row.engagementId,
    source: {
      recordingAssetId: row.sourceJson?.recordingAssetId,
      transcriptJobId: row.sourceJson?.transcriptJobId,
      segmentId: row.sourceJson?.segmentId,
      sourceTextSha256: row.sourceJson?.sourceTextSha256,
    },
  };
}

export function assertRetainedSpeechWork({ before, after, actorId }) {
  for (const [collection, kind, owner] of [
    ["tasks", "task", "assignedUserId"],
    ["goals", "goal", "ownerUserId"],
  ]) {
    assert.equal(after[collection].length, 1, `Expected exactly one source-bound ${kind}, without duplicates.`);
    const current = after[collection][0];
    const previous = before[collection].find((row) => row.id === current.id);
    if (before[collection].length) {
      assert(previous, `Repeated speech replaced the retained ${kind} instead of keeping its identity.`);
      assert.deepEqual(editableWork(current, kind), editableWork(previous, kind),
        `Repeated speech overwrote the retained ${kind}'s editable work or source anchor.`);
    } else {
      assert.equal(current[owner], actorId, `New first-person ${kind} must belong to the recording speaker.`);
    }
  }
}
