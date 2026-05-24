import {
  getActiveDecisionEvents,
  isProgramState,
  mergeDecisionEvents,
  PROGRAM_STATE_LABELS,
  type DecisionEvent,
  type ProgramState,
} from "@high-ground/studio-cut-schema";

export type AgentDecisionOperation =
  | {
      op: "addDecision";
      sourceTimeMs: number;
      state: ProgramState;
      id?: string;
      note?: string;
    }
  | {
      op: "removeDecision";
      id: string;
      reason?: string;
    };

export type AgentDecisionOpsPayload = {
  schemaVersion: 1;
  projectId?: string;
  branchId?: string;
  operations: AgentDecisionOperation[];
};

export type AgentDecisionOpsPreview = {
  fileName: string;
  operationCount: number;
  addCount: number;
  removeCount: number;
  activeDecisionCountAfterApply: number;
  tombstonedDecisionCountAfterApply: number;
  decisionEvents: DecisionEvent[];
  activeDecisionEvents: DecisionEvent[];
  summaries: string[];
  warnings: string[];
  errors: string[];
};

export function buildAgentDecisionOpsPreview({
  payload,
  fileName,
  currentEvents,
  projectId,
  branchId,
  createdBy,
  sourceDurationMs,
  clientId,
  now = new Date().toISOString(),
}: {
  payload: unknown;
  fileName: string;
  currentEvents: readonly DecisionEvent[];
  projectId: string;
  branchId: string;
  createdBy: string;
  sourceDurationMs: number;
  clientId: string;
  now?: string;
}): AgentDecisionOpsPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const summaries: string[] = [];
  const normalizedPayload = parseAgentDecisionOpsPayload(payload, errors);
  const targetProjectId = normalizedPayload?.projectId ?? projectId;
  const targetBranchId = normalizedPayload?.branchId ?? branchId;
  const nextEvents = currentEvents.map((event) => ({ ...event }));

  if (targetProjectId !== projectId) {
    errors.push(
      `Operation file projectId ${targetProjectId} does not match active room ${projectId}.`,
    );
  }

  if (targetBranchId !== branchId) {
    errors.push(
      `Operation file branchId ${targetBranchId} does not match active room ${branchId}.`,
    );
  }

  if (!normalizedPayload) {
    return createAgentDecisionOpsPreview({
      fileName,
      operations: [],
      decisionEvents: nextEvents,
      summaries,
      warnings,
      errors,
    });
  }

  normalizedPayload.operations.forEach((operation, index) => {
    if (operation.op === "addDecision") {
      const sourceTimeMs = clampSourceTimeMs(
        operation.sourceTimeMs,
        sourceDurationMs,
      );
      const id =
        operation.id?.trim() ||
        createAgentDecisionEventId({
          projectId,
          branchId,
          state: operation.state,
          sourceTimeMs,
        });

      if (nextEvents.some((event) => event.id === id)) {
        errors.push(`operations[${index}].id already exists: ${id}`);
        return;
      }

      const event: DecisionEvent = {
        id,
        projectId,
        branchId,
        sourceTimeMs,
        state: operation.state,
        createdBy,
        createdAt: now,
        clientId,
        operation: "upsert",
        ...(operation.note?.trim() ? { note: operation.note.trim() } : {}),
      };

      nextEvents.push(event);
      summaries.push(
        `Add ${PROGRAM_STATE_LABELS[event.state]} at ${formatSourceTime(sourceTimeMs)}.`,
      );
      return;
    }

    const targetIndex = nextEvents.findIndex((event) => event.id === operation.id);
    if (targetIndex === -1) {
      errors.push(`operations[${index}].id does not match an active decision: ${operation.id}`);
      return;
    }

    const targetEvent = nextEvents[targetIndex];
    const tombstonedEvent: DecisionEvent = {
      ...targetEvent,
      removedAt: now,
      removedBy: createdBy,
      clientId: targetEvent.clientId ?? clientId,
      operation: "remove",
      ...(operation.reason?.trim()
        ? {
            note: appendDecisionNote(
              targetEvent.note,
              `Agent remove: ${operation.reason.trim()}`,
            ),
          }
        : {}),
    };

    nextEvents[targetIndex] = tombstonedEvent;
    summaries.push(
      `Remove ${PROGRAM_STATE_LABELS[targetEvent.state]} at ${formatSourceTime(
        targetEvent.sourceTimeMs,
      )}.`,
    );
  });

  if (normalizedPayload.operations.length === 0) {
    warnings.push("Operation file contains no operations.");
  }

  return createAgentDecisionOpsPreview({
    fileName,
    operations: normalizedPayload.operations,
    decisionEvents: nextEvents,
    summaries,
    warnings,
    errors,
  });
}

function parseAgentDecisionOpsPayload(
  payload: unknown,
  errors: string[],
): AgentDecisionOpsPayload | null {
  if (!payload || typeof payload !== "object") {
    errors.push("Agent operation file must be a JSON object.");
    return null;
  }

  const candidate = payload as Partial<AgentDecisionOpsPayload>;

  if (candidate.schemaVersion !== 1) {
    errors.push("Agent operation file schemaVersion must be 1.");
  }

  if (
    candidate.projectId !== undefined &&
    (typeof candidate.projectId !== "string" || !candidate.projectId.trim())
  ) {
    errors.push("Agent operation file projectId must be a non-empty string when present.");
  }

  if (
    candidate.branchId !== undefined &&
    (typeof candidate.branchId !== "string" || !candidate.branchId.trim())
  ) {
    errors.push("Agent operation file branchId must be a non-empty string when present.");
  }

  if (!Array.isArray(candidate.operations)) {
    errors.push("Agent operation file must include operations[].");
    return null;
  }

  const operations = candidate.operations.flatMap((operation, index) => {
    const parsedOperation = parseAgentDecisionOperation(operation, index, errors);
    return parsedOperation ? [parsedOperation] : [];
  });

  if (errors.length > 0) {
    return null;
  }

  return {
    schemaVersion: 1,
    ...(candidate.projectId ? { projectId: candidate.projectId.trim() } : {}),
    ...(candidate.branchId ? { branchId: candidate.branchId.trim() } : {}),
    operations,
  };
}

function parseAgentDecisionOperation(
  operation: unknown,
  index: number,
  errors: string[],
): AgentDecisionOperation | null {
  const label = `operations[${index}]`;

  if (!operation || typeof operation !== "object") {
    errors.push(`${label} must be an object.`);
    return null;
  }

  const candidate = operation as Record<string, unknown>;

  if (candidate.op === "addDecision") {
    if (typeof candidate.sourceTimeMs !== "number" || !Number.isFinite(candidate.sourceTimeMs)) {
      errors.push(`${label}.sourceTimeMs must be a finite number.`);
    }

    if (!isProgramState(candidate.state)) {
      errors.push(`${label}.state must be a valid Studio Cut program state.`);
    }

    if (candidate.id !== undefined && typeof candidate.id !== "string") {
      errors.push(`${label}.id must be a string when present.`);
    }

    if (candidate.note !== undefined && typeof candidate.note !== "string") {
      errors.push(`${label}.note must be a string when present.`);
    }

    if (
      typeof candidate.sourceTimeMs !== "number" ||
      !Number.isFinite(candidate.sourceTimeMs) ||
      !isProgramState(candidate.state)
    ) {
      return null;
    }

    return {
      op: "addDecision",
      sourceTimeMs: candidate.sourceTimeMs,
      state: candidate.state,
      ...(typeof candidate.id === "string" && candidate.id.trim()
        ? { id: candidate.id.trim() }
        : {}),
      ...(typeof candidate.note === "string" ? { note: candidate.note } : {}),
    };
  }

  if (candidate.op === "removeDecision") {
    if (typeof candidate.id !== "string" || !candidate.id.trim()) {
      errors.push(`${label}.id must be a non-empty string.`);
      return null;
    }

    if (candidate.reason !== undefined && typeof candidate.reason !== "string") {
      errors.push(`${label}.reason must be a string when present.`);
    }

    return {
      op: "removeDecision",
      id: candidate.id.trim(),
      ...(typeof candidate.reason === "string" ? { reason: candidate.reason } : {}),
    };
  }

  errors.push(`${label}.op must be addDecision or removeDecision.`);
  return null;
}

function createAgentDecisionOpsPreview({
  fileName,
  operations,
  decisionEvents,
  summaries,
  warnings,
  errors,
}: {
  fileName: string;
  operations: readonly AgentDecisionOperation[];
  decisionEvents: readonly DecisionEvent[];
  summaries: string[];
  warnings: string[];
  errors: string[];
}): AgentDecisionOpsPreview {
  const mergedDecisionEvents = mergeDecisionEvents(decisionEvents);
  const activeDecisionEvents = getActiveDecisionEvents(mergedDecisionEvents);

  return {
    fileName,
    operationCount: operations.length,
    addCount: operations.filter((operation) => operation.op === "addDecision").length,
    removeCount: operations.filter((operation) => operation.op === "removeDecision").length,
    activeDecisionCountAfterApply: activeDecisionEvents.length,
    tombstonedDecisionCountAfterApply:
      mergedDecisionEvents.length - activeDecisionEvents.length,
    decisionEvents: mergedDecisionEvents,
    activeDecisionEvents,
    summaries,
    warnings,
    errors,
  };
}

function clampSourceTimeMs(sourceTimeMs: number, sourceDurationMs: number) {
  return Math.min(sourceDurationMs, Math.max(0, Math.round(sourceTimeMs)));
}

function createAgentDecisionEventId({
  projectId,
  branchId,
  state,
  sourceTimeMs,
}: {
  projectId: string;
  branchId: string;
  state: ProgramState;
  sourceTimeMs: number;
}) {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  const randomSuffix =
    randomUUID
      ? randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `agent-${slugify(`${projectId}-${branchId}-${state}-${sourceTimeMs}`)}-${randomSuffix}`;
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "decision"
  );
}

function appendDecisionNote(currentNote: string | undefined, addition: string) {
  return currentNote?.trim() ? `${currentNote.trim()} | ${addition}` : addition;
}

function formatSourceTime(sourceTimeMs: number) {
  const totalSeconds = Math.floor(sourceTimeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
