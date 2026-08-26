function label(value: unknown) {
  return typeof value === "string" ? value : null;
}

function sourceJson(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function transcriptResultSource(
  value: unknown,
  roomId: string,
  transcriptJobId: string,
) {
  const source = sourceJson(value);
  if (
    source.origin !== "quipsly-session-follow-through" ||
    label(source.roomId) !== roomId ||
    label(source.transcriptJobId) !== transcriptJobId
  ) {
    return null;
  }
  return {
    segmentId: label(source.segmentId),
    startSeconds:
      typeof source.startSeconds === "number" ? source.startSeconds : null,
    endSeconds:
      typeof source.endSeconds === "number" ? source.endSeconds : null,
    speakerLabel: label(source.speakerLabel),
  };
}

/**
 * Projects ordinary, editable work created from one transcript back into its
 * Session. Source links explain where a result came from; they never create a
 * second approval workflow.
 */
export function sessionTranscriptResults(input: {
  roomId: string;
  transcriptJobId?: string | null;
  summary?: any;
  highlights?: any[];
  actionItems?: any[];
  goals?: any[];
}) {
  const transcriptJobId = label(input.transcriptJobId);
  if (!transcriptJobId || !input.summary) return null;

  const notes = (input.highlights || []).map((note: any) => {
    const source = sourceJson(note.sourceJson);
    return {
      id: note.id,
      title: note.title,
      body: note.body,
      source: {
        segmentId: label(source.segmentId),
        startSeconds:
          typeof source.startSeconds === "number" ? source.startSeconds : null,
        endSeconds:
          typeof source.endSeconds === "number" ? source.endSeconds : null,
        speakerLabel: label(source.speakerLabel),
      },
    };
  });
  const tasks = (input.actionItems || []).flatMap((item: any) => {
    const source = transcriptResultSource(
      item.sourceJson,
      input.roomId,
      transcriptJobId,
    );
    return source
      ? [{
          id: item.id,
          title: item.title,
          detail: item.detail,
          status: item.status,
          assignedUserId: item.assignedUserId,
          dueAt: item.dueAt?.toISOString?.() ?? null,
          completedAt: item.completedAt?.toISOString?.() ?? null,
          source,
        }]
      : [];
  });
  const goals = (input.goals || []).flatMap((goal: any) => {
    const source = transcriptResultSource(
      goal.sourceJson,
      input.roomId,
      transcriptJobId,
    );
    return source
      ? [{
          id: goal.id,
          title: goal.title,
          description: goal.description,
          status: goal.status,
          ownerUserId: goal.ownerUserId,
          targetAt: goal.targetAt?.toISOString?.() ?? null,
          achievedAt: goal.achievedAt?.toISOString?.() ?? null,
          source,
        }]
      : [];
  });

  return {
    automaticallyCreated: true as const,
    editable: true as const,
    removable: true as const,
    summary: {
      id: input.summary.id,
      title: input.summary.title,
      body: input.summary.body,
    },
    notes,
    tasks,
    goals,
  };
}
