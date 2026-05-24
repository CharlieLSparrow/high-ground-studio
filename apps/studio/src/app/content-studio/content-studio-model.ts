export const CONTENT_STUDIO_STORAGE_KEY =
  "high-ground-studio.content-studio.v1";
export const CONTENT_STUDIO_SCHEMA_VERSION = 1;
export const CONTENT_STUDIO_PACKET_KIND =
  "high-ground-content-studio-browser-packet";
export const CONTENT_STUDIO_PRODUCTION_PACKET_KIND =
  "high-ground-content-studio-production-packet";

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

export type ContentStudioProductionPacketTarget = {
  id: string;
  label: string;
  kind:
    | "hgo-stage"
    | "podcast-host"
    | "book-publishing"
    | "studio-cut"
    | "worldhub"
    | "coaching"
    | "social"
    | "review";
  status: "draft" | "ready" | "blocked";
  notes: string;
};

export type ContentStudioProductionPacketTask = {
  id: string;
  stage: StageId;
  label: string;
  done: boolean;
};

export type ContentStudioProductionAgentTask = {
  id: string;
  goal: string;
  outputShape: string;
  reviewRequired: true;
};

export type ContentStudioHgoProjectionDraft = {
  id: string;
  status: "staged";
  visibility: "private";
  slug: string;
  episodeNumber: string;
  title: string;
  subtitle: string;
  summary: string;
  thesis: string;
  lifecycleNote: string;
  hero: {
    eyebrow: string;
    visualPrompt: string;
    colorMood: string;
  };
  audio: {
    state: "not-recorded" | "recorded";
    placeholderLabel: string;
    durationLabel?: string;
  };
  scopes: Array<"book-only" | "episode-only" | "book-and-episode" | "internal">;
  beats: Array<{
    title: string;
    summary: string;
    scope: "book-only" | "episode-only" | "book-and-episode" | "internal";
    timingHint?: string;
  }>;
  voiceCards: Array<{
    speaker: "Charlie" | "Homer";
    summary: string;
  }>;
  pullQuotes: Array<{
    text: string;
    attribution: string;
    citationState: "needs-review";
  }>;
  sourceNotes: Array<{
    label: string;
    detail: string;
    status: "needs-review";
  }>;
  relatedBookChapter?: {
    title: string;
    summary: string;
    status: "staged";
  };
  backstageNotes: Array<{
    label: string;
    note: string;
  }>;
  projectionSource: {
    bridgeVersion: "studio-browser-v1";
    generatedAt: string;
    sourceFileName?: string;
  };
};

export type ContentStudioProductionPacket = {
  kind: typeof CONTENT_STUDIO_PRODUCTION_PACKET_KIND;
  schemaVersion: typeof CONTENT_STUDIO_SCHEMA_VERSION;
  generatedAt: string;
  projectId: string;
  projectTitle: string;
  projectKind: ProjectKind;
  workflow:
    | "podcast-production"
    | "book-publishing"
    | "hgo-episode-page"
    | "worldhub-follow-through"
    | "coaching-operations";
  safety: {
    providerCalls: false;
    publicPublished: false;
    containsRealManuscriptText: false;
    requiresHumanReview: true;
  };
  handoff: ContentStudioProjectHandoff;
  deliveryTargets: ContentStudioProductionPacketTarget[];
  taskChecklist: ContentStudioProductionPacketTask[];
  agentTasks: ContentStudioProductionAgentTask[];
  hgoProjectionDraft?: ContentStudioHgoProjectionDraft;
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

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "content-studio-project";
}

function getProjectWorkflow(project: ContentStudioProject) {
  if (project.kind === "podcast") {
    return "podcast-production" as const;
  }

  if (project.kind === "book") {
    return "book-publishing" as const;
  }

  if (project.kind === "episode-page") {
    return "hgo-episode-page" as const;
  }

  if (project.kind === "coaching") {
    return "coaching-operations" as const;
  }

  return "worldhub-follow-through" as const;
}

function createDeliveryTargets(
  project: ContentStudioProject,
  handoff: ContentStudioProjectHandoff,
): ContentStudioProductionPacketTarget[] {
  const status = handoff.readyToPublish ? "ready" : "draft";

  if (project.kind === "podcast") {
    return [
      {
        id: "podcast-host-metadata",
        label: "Podcast host metadata",
        kind: "podcast-host",
        status,
        notes: "Title, summary, chapter markers, clean asset links, and publish checklist. No host API call is made.",
      },
      {
        id: "hgo-episode-page-draft",
        label: "HGO episode page draft",
        kind: "hgo-stage",
        status,
        notes: "Staged projection JSON for HGO review before any public page promotion.",
      },
      {
        id: "studio-cut-edit-package",
        label: "Studio Cut edit package",
        kind: "studio-cut",
        status: "draft",
        notes: "Clip candidates, chapter intent, and review flags for the media lane.",
      },
      {
        id: "social-email-follow-through",
        label: "Social and email follow-through",
        kind: "social",
        status: "draft",
        notes: "Caption prompts, pull-quote candidates, and launch-loop reminders.",
      },
    ];
  }

  if (project.kind === "book") {
    return [
      {
        id: "book-manuscript-export",
        label: "Book manuscript export",
        kind: "book-publishing",
        status,
        notes: "Chapter map, unresolved review list, and future Kindle/Audible package placeholders.",
      },
      {
        id: "hgo-companion-page",
        label: "HGO companion page",
        kind: "hgo-stage",
        status: "draft",
        notes: "Book-facing public projection candidate. Review before exposing real text.",
      },
      {
        id: "worldhub-book-offer",
        label: "WorldHub book offer follow-through",
        kind: "worldhub",
        status: "draft",
        notes: "Supporter, coaching, or merch ideas connected to the book project without provider calls.",
      },
    ];
  }

  if (project.kind === "episode-page") {
    return [
      {
        id: "hgo-staged-projection",
        label: "HGO staged projection",
        kind: "hgo-stage",
        status,
        notes: "Paste the included projection draft into `/projection-stage/import` for validation and review.",
      },
      {
        id: "citation-review",
        label: "Citation and source review",
        kind: "review",
        status: handoff.readyToPublish ? "ready" : "draft",
        notes: "Quote and source states must clear review before any public-safe promotion.",
      },
      {
        id: "launch-follow-through",
        label: "Launch follow-through",
        kind: "social",
        status: "draft",
        notes: "Social, email, coaching, and supporter tie-ins after page review.",
      },
    ];
  }

  if (project.kind === "coaching") {
    return [
      {
        id: "coaching-intake-copy",
        label: "Coaching intake copy",
        kind: "coaching",
        status,
        notes: "Public-safe CTA and internal prep notes for the existing coaching request workflow.",
      },
      {
        id: "team-console-follow-up",
        label: "Team console follow-up",
        kind: "coaching",
        status: "draft",
        notes: "Manual follow-through for `/team/coaching-requests` and appointments.",
      },
    ];
  }

  return [
    {
      id: "worldhub-offer-brief",
      label: "WorldHub offer brief",
      kind: "worldhub",
      status,
      notes: "Offer promise, audience fit, fulfillment assumptions, and provider adapter requirements.",
    },
    {
      id: "provider-adapter-later",
      label: "Provider adapter later",
      kind: "worldhub",
      status: "blocked",
      notes: "Stripe, Patreon, merch, POD, and fulfillment calls stay blocked until a deliberate provider slice.",
    },
  ];
}

function createAgentTasks(
  project: ContentStudioProject,
  handoff: ContentStudioProjectHandoff,
): ContentStudioProductionAgentTask[] {
  return [
    {
      id: `${project.id}-next-action`,
      goal: handoff.nextAction
        ? `Complete or unblock: ${handoff.nextAction}`
        : `Review ${project.title} and confirm the next useful production action.`,
      outputShape:
        "Return a short status note, changed files or artifacts, validation run, risks, and next handoff.",
      reviewRequired: true,
    },
    {
      id: `${project.id}-readiness-review`,
      goal: `Review ${project.title} for missing source, citation, publish, and follow-through tasks.`,
      outputShape:
        "Return blockers first, then ready items, then the safest deploy or publishing boundary.",
      reviewRequired: true,
    },
  ];
}

function createTaskChecklist(
  project: ContentStudioProject,
): ContentStudioProductionPacketTask[] {
  return contentStudioStageDefinitions.flatMap((stage) =>
    project.stages[stage.id].map((task) => ({
      id: task.id,
      stage: stage.id,
      label: task.label,
      done: task.done,
    })),
  );
}

function createHgoProjectionDraft(
  project: ContentStudioProject,
  generatedAt: string,
): ContentStudioHgoProjectionDraft | undefined {
  if (project.kind !== "podcast" && project.kind !== "episode-page") {
    return undefined;
  }

  const slug = slugify(project.title);
  const sourceTasks = project.stages.source.map((task) => task.label);
  const shapeTasks = project.stages.shape.map((task) => task.label);
  const produceTasks = project.stages.produce.map((task) => task.label);
  const summary =
    project.notes.trim() ||
    "Content Studio generated staged projection draft for review.";

  return {
    id: `studio-projection-${project.id}`,
    status: "staged",
    visibility: "private",
    slug,
    episodeNumber: "TBD",
    title: project.title,
    subtitle: "Staged Content Studio projection draft",
    summary,
    thesis:
      shapeTasks[0] ??
      "Confirm the episode thesis before promotion beyond staged review.",
    lifecycleNote:
      "Generated by Content Studio as a private staged review draft. It is not published and still requires human review.",
    hero: {
      eyebrow: project.kind === "podcast" ? "Podcast draft" : "Episode page draft",
      visualPrompt:
        "Create a public-safe visual direction after source and citation review.",
      colorMood: "High contrast field notes with warm editorial accents",
    },
    audio: {
      state: project.kind === "podcast" ? "recorded" : "not-recorded",
      placeholderLabel:
        project.kind === "podcast"
          ? "Audio/video asset pending final edit"
          : "Episode media not attached",
      durationLabel: "Timing TBD",
    },
    scopes:
      project.kind === "podcast"
        ? ["episode-only", "book-and-episode"]
        : ["episode-only", "internal"],
    beats: contentStudioStageDefinitions.map((stage) => ({
      title: stage.label,
      summary:
        project.stages[stage.id]
          .map((task) => `${task.done ? "Done" : "Open"}: ${task.label}`)
          .join(" / ") || `${stage.label} tasks not defined yet.`,
      scope: stage.id === "publish" ? "episode-only" : "internal",
      timingHint: stage.id === project.activeStage ? "Active stage" : undefined,
    })),
    voiceCards: [
      {
        speaker: "Charlie",
        summary:
          sourceTasks[0] ?? "Confirm the host framing before staged review.",
      },
      {
        speaker: "Homer",
        summary:
          produceTasks[0] ??
          "Confirm what must be recorded, revised, or held for later.",
      },
    ],
    pullQuotes: [],
    sourceNotes: [
      {
        label: "Content Studio source boundary",
        detail:
          "This projection was generated from project metadata and task labels, not from reviewed source excerpts.",
        status: "needs-review",
      },
    ],
    backstageNotes: [
      {
        label: "Next Content Studio action",
        note:
          createContentStudioProjectHandoff(project).nextAction ??
          "Choose the next production checkpoint.",
      },
    ],
    projectionSource: {
      bridgeVersion: "studio-browser-v1",
      generatedAt,
      sourceFileName: "content-studio-production-packet.json",
    },
  };
}

export function createContentStudioProductionPacket(
  project: ContentStudioProject,
  generatedAt = new Date().toISOString(),
): ContentStudioProductionPacket {
  const handoff = createContentStudioProjectHandoff(project);

  return {
    kind: CONTENT_STUDIO_PRODUCTION_PACKET_KIND,
    schemaVersion: CONTENT_STUDIO_SCHEMA_VERSION,
    generatedAt,
    projectId: project.id,
    projectTitle: project.title,
    projectKind: project.kind,
    workflow: getProjectWorkflow(project),
    safety: {
      providerCalls: false,
      publicPublished: false,
      containsRealManuscriptText: false,
      requiresHumanReview: true,
    },
    handoff,
    deliveryTargets: createDeliveryTargets(project, handoff),
    taskChecklist: createTaskChecklist(project),
    agentTasks: createAgentTasks(project, handoff),
    hgoProjectionDraft: createHgoProjectionDraft(project, generatedAt),
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
