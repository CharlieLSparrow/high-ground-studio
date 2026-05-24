export const CONTENT_STUDIO_STORAGE_KEY =
  "high-ground-studio.content-studio.v1";
export const CONTENT_STUDIO_SCHEMA_VERSION = 1;
export const CONTENT_STUDIO_PACKET_KIND =
  "high-ground-content-studio-browser-packet";

export type ProjectKind =
  | "podcast"
  | "book"
  | "episode-page"
  | "monetization"
  | "coaching";

export type ProjectPriority = "primary" | "secondary" | "parking-lot";
export type ProjectStatus = "active" | "queued" | "blocked" | "ready" | "shipped";
export type StageId = "source" | "shape" | "produce" | "publish" | "follow-through";

export type ContentStudioTask = {
  id: string;
  label: string;
  done: boolean;
};

export type ContentStudioProject = {
  id: string;
  title: string;
  kind: ProjectKind;
  priority: ProjectPriority;
  status: ProjectStatus;
  activeStage: StageId;
  updatedAt: string;
  notes: string;
  stages: Record<StageId, ContentStudioTask[]>;
};

export type ContentStudioWorkspace = {
  schemaVersion: number;
  updatedAt: string;
  projects: ContentStudioProject[];
};

export type ContentStudioProjectHandoff = {
  projectId: string;
  title: string;
  kind: ProjectKind;
  priority: ProjectPriority;
  status: ProjectStatus;
  activeStage: StageId;
  progress: {
    done: number;
    total: number;
    percentage: number;
  };
  nextAction: string | null;
  blocked: boolean;
  readyToPublish: boolean;
  incompleteByStage: Record<StageId, string[]>;
};

export type ContentStudioBrowserPacket = {
  kind: typeof CONTENT_STUDIO_PACKET_KIND;
  schemaVersion: typeof CONTENT_STUDIO_SCHEMA_VERSION;
  exportedAt: string;
  actorLabel: string;
  safety: {
    browserLocalOnly: true;
    persistedToServer: false;
    providerCalls: false;
    publicPublished: false;
    containsRealManuscriptText: false;
  };
  workspace: ContentStudioWorkspace;
  projectHandoffs: ContentStudioProjectHandoff[];
};

export type ContentStudioPacketParseResult =
  | {
      ok: true;
      workspace: ContentStudioWorkspace;
      warnings: string[];
    }
  | {
      ok: false;
      errors: string[];
      warnings: string[];
    };

export const contentStudioStageDefinitions: Array<{
  id: StageId;
  label: string;
  shortLabel: string;
}> = [
  { id: "source", label: "Source", shortLabel: "Src" },
  { id: "shape", label: "Shape", shortLabel: "Map" },
  { id: "produce", label: "Produce", shortLabel: "Make" },
  { id: "publish", label: "Publish", shortLabel: "Ship" },
  { id: "follow-through", label: "Follow-through", shortLabel: "Loop" },
];

export function isProjectKind(value: unknown): value is ProjectKind {
  return (
    value === "podcast" ||
    value === "book" ||
    value === "episode-page" ||
    value === "monetization" ||
    value === "coaching"
  );
}

export function isProjectPriority(value: unknown): value is ProjectPriority {
  return value === "primary" || value === "secondary" || value === "parking-lot";
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    value === "active" ||
    value === "queued" ||
    value === "blocked" ||
    value === "ready" ||
    value === "shipped"
  );
}

export function isStageId(value: unknown): value is StageId {
  return contentStudioStageDefinitions.some((stage) => stage.id === value);
}

export function isContentStudioTask(value: unknown): value is ContentStudioTask {
  if (!value || typeof value !== "object") {
    return false;
  }

  const task = value as Partial<ContentStudioTask>;

  return (
    typeof task.id === "string" &&
    typeof task.label === "string" &&
    typeof task.done === "boolean"
  );
}

export function isStageRecord(
  value: unknown,
): value is Record<StageId, ContentStudioTask[]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<Record<StageId, unknown>>;

  return contentStudioStageDefinitions.every((stage) => {
    const tasks = record[stage.id];

    return Array.isArray(tasks) && tasks.every(isContentStudioTask);
  });
}

export function isContentStudioProject(
  value: unknown,
): value is ContentStudioProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<ContentStudioProject>;

  return (
    typeof project.id === "string" &&
    typeof project.title === "string" &&
    typeof project.notes === "string" &&
    typeof project.updatedAt === "string" &&
    isProjectKind(project.kind) &&
    isProjectPriority(project.priority) &&
    isProjectStatus(project.status) &&
    isStageId(project.activeStage) &&
    isStageRecord(project.stages)
  );
}

export function normalizeContentStudioWorkspace(
  value: unknown,
  now = new Date().toISOString(),
): ContentStudioWorkspace | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const workspace = value as Partial<ContentStudioWorkspace>;

  if (
    workspace.schemaVersion !== CONTENT_STUDIO_SCHEMA_VERSION ||
    !Array.isArray(workspace.projects)
  ) {
    return null;
  }

  return {
    schemaVersion: CONTENT_STUDIO_SCHEMA_VERSION,
    updatedAt: typeof workspace.updatedAt === "string" ? workspace.updatedAt : now,
    projects: workspace.projects.filter(isContentStudioProject),
  };
}

export function getContentStudioProjectProgress(project: ContentStudioProject) {
  const tasks = contentStudioStageDefinitions.flatMap(
    (stage) => project.stages[stage.id],
  );
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;

  return {
    done,
    total,
    percentage: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function createContentStudioProjectHandoff(
  project: ContentStudioProject,
): ContentStudioProjectHandoff {
  const incompleteByStage = contentStudioStageDefinitions.reduce(
    (summary, stage) => {
      summary[stage.id] = project.stages[stage.id]
        .filter((task) => !task.done)
        .map((task) => task.label);
      return summary;
    },
    {
      source: [],
      shape: [],
      produce: [],
      publish: [],
      "follow-through": [],
    } as Record<StageId, string[]>,
  );
  const nextActiveStageTask = incompleteByStage[project.activeStage][0] ?? null;
  const nextAnyTask =
    contentStudioStageDefinitions
      .map((stage) => incompleteByStage[stage.id][0])
      .find((label): label is string => Boolean(label)) ?? null;
  const progress = getContentStudioProjectProgress(project);

  return {
    projectId: project.id,
    title: project.title,
    kind: project.kind,
    priority: project.priority,
    status: project.status,
    activeStage: project.activeStage,
    progress,
    nextAction: nextActiveStageTask ?? nextAnyTask,
    blocked: project.status === "blocked",
    readyToPublish:
      project.status === "ready" &&
      incompleteByStage.source.length === 0 &&
      incompleteByStage.shape.length === 0 &&
      incompleteByStage.produce.length === 0 &&
      incompleteByStage.publish.length === 0,
    incompleteByStage,
  };
}

export function buildContentStudioBrowserPacket(input: {
  workspace: ContentStudioWorkspace;
  actorLabel: string;
  exportedAt?: string;
}): ContentStudioBrowserPacket {
  return {
    kind: CONTENT_STUDIO_PACKET_KIND,
    schemaVersion: CONTENT_STUDIO_SCHEMA_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    actorLabel: input.actorLabel,
    safety: {
      browserLocalOnly: true,
      persistedToServer: false,
      providerCalls: false,
      publicPublished: false,
      containsRealManuscriptText: false,
    },
    workspace: input.workspace,
    projectHandoffs: input.workspace.projects.map(createContentStudioProjectHandoff),
  };
}

export function parseContentStudioPacket(
  value: unknown,
): ContentStudioPacketParseResult {
  const warnings: string[] = [];

  if (!value || typeof value !== "object") {
    return {
      ok: false,
      warnings,
      errors: ["Packet must be a JSON object."],
    };
  }

  const maybeWorkspace = normalizeContentStudioWorkspace(value);

  if (maybeWorkspace) {
    return {
      ok: true,
      workspace: maybeWorkspace,
      warnings: ["Imported a raw Content Studio workspace without packet metadata."],
    };
  }

  const packet = value as Partial<ContentStudioBrowserPacket>;
  const errors: string[] = [];

  if (packet.kind !== CONTENT_STUDIO_PACKET_KIND) {
    errors.push(`Packet kind must be ${CONTENT_STUDIO_PACKET_KIND}.`);
  }

  if (packet.schemaVersion !== CONTENT_STUDIO_SCHEMA_VERSION) {
    errors.push(`Packet schemaVersion must be ${CONTENT_STUDIO_SCHEMA_VERSION}.`);
  }

  if (!packet.safety || typeof packet.safety !== "object") {
    errors.push("Packet safety flags are missing.");
  } else {
    if (packet.safety.providerCalls !== false) {
      errors.push("Packet cannot be imported after provider calls.");
    }

    if (packet.safety.publicPublished !== false) {
      errors.push("Packet cannot be imported after public publishing.");
    }

    if (packet.safety.containsRealManuscriptText !== false) {
      errors.push("Packet cannot claim to contain real manuscript text.");
    }

    if (packet.safety.persistedToServer !== false) {
      warnings.push("Packet says it was persisted elsewhere; verify source before use.");
    }
  }

  const workspace = normalizeContentStudioWorkspace(packet.workspace);

  if (!workspace) {
    errors.push("Packet workspace is missing or invalid.");
  }

  if (errors.length > 0 || !workspace) {
    return {
      ok: false,
      errors,
      warnings,
    };
  }

  return {
    ok: true,
    workspace,
    warnings,
  };
}
