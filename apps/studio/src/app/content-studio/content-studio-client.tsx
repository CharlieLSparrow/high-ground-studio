"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "../studio-ui";
import {
  buildContentStudioBrowserPacket,
  createContentStudioProductionPacket,
  createContentStudioProjectHandoff,
  parseContentStudioPacket,
  type ContentStudioProductionPacket,
  type ContentStudioProjectHandoff,
} from "./content-studio-model";

const STORAGE_KEY = "high-ground-studio.content-studio.v1";
const SCHEMA_VERSION = 1;
const HGO_STAGE_IMPORT_URL =
  "https://app.highgroundodyssey.com/projection-stage/import";
const HGO_STAGE_IMPORT_HANDOFF_URL = `${HGO_STAGE_IMPORT_URL}?source=content-studio`;
const HGO_PUBLISH_QUEUE_URL =
  "https://app.highgroundodyssey.com/team/hgo-publish-queue";

type ProjectKind =
  | "podcast"
  | "book"
  | "episode-page"
  | "monetization"
  | "coaching";

type ProjectPriority = "primary" | "secondary" | "parking-lot";
type ProjectStatus = "active" | "queued" | "blocked" | "ready" | "shipped";
type StageId = "source" | "shape" | "produce" | "publish" | "follow-through";

type ContentStudioTask = {
  id: string;
  label: string;
  done: boolean;
};

type ContentStudioProject = {
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

type ContentStudioWorkspace = {
  schemaVersion: number;
  updatedAt: string;
  projects: ContentStudioProject[];
};

type ProjectTemplate = {
  id: ProjectKind;
  title: string;
  label: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  activeStage: StageId;
  notes: string;
  stages: Record<StageId, string[]>;
};

type ServerSnapshotSummary = {
  id: string;
  title: string;
  projectCount: number;
  activeCount: number;
  readyCount: number;
  blockedCount: number;
  updatedAt: string;
};

type ServerSnapshotDetail = ServerSnapshotSummary & {
  workspace?: unknown;
};

const stageDefinitions: Array<{
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

const projectKindLabel: Record<ProjectKind, string> = {
  podcast: "Podcast",
  book: "Book",
  "episode-page": "Episode Page",
  monetization: "Monetization",
  coaching: "Coaching",
};

const priorityLabel: Record<ProjectPriority, string> = {
  primary: "Primary",
  secondary: "Secondary",
  "parking-lot": "Parking Lot",
};

const statusLabel: Record<ProjectStatus, string> = {
  active: "Active",
  queued: "Queued",
  blocked: "Blocked",
  ready: "Ready",
  shipped: "Shipped",
};

const projectTemplates: ProjectTemplate[] = [
  {
    id: "podcast",
    title: "Podcast episode production",
    label: "Podcast",
    priority: "primary",
    status: "active",
    activeStage: "produce",
    notes:
      "Audio/video edit, show notes, episode page packet, publish checklist, and audience follow-through.",
    stages: {
      source: [
        "Collect recording, transcript, and edit notes",
        "Mark source clips and pull-quote candidates",
        "Flag anything that needs citation or content review",
      ],
      shape: [
        "Confirm episode thesis and title options",
        "Build segment order and chapter markers",
        "Draft show-note outline and listener promise",
      ],
      produce: [
        "Run rough edit pass",
        "Prepare clean publish audio/video assets",
        "Create thumbnail and short clip candidates",
      ],
      publish: [
        "Generate HGO episode page packet",
        "Prepare podcast host metadata package",
        "Queue social/email captions for review",
      ],
      "follow-through": [
        "Capture analytics notes after launch",
        "Log merch, Patreon, or coaching tie-in ideas",
        "Add next-episode follow-up prompts",
      ],
    },
  },
  {
    id: "book",
    title: "Book writing and publishing",
    label: "Book",
    priority: "primary",
    status: "active",
    activeStage: "shape",
    notes:
      "Manuscript source, structure, draft readiness, publishing package, and learning loop.",
    stages: {
      source: [
        "Select manuscript snapshot or browser draft",
        "Tag source blocks for chapter, story, quote, and question",
        "Separate canonical manuscript truth from working drafts",
      ],
      shape: [
        "Confirm chapter map and section sequence",
        "Build unresolved story and quote review list",
        "Create export packet for the next writing pass",
      ],
      produce: [
        "Draft or revise selected chapter section",
        "Run citation and quote review",
        "Prepare reader-facing summary and excerpt options",
      ],
      publish: [
        "Assemble book publish package checklist",
        "Draft HGO companion page or reading packet",
        "Prepare Kindle/Audible metadata placeholders",
      ],
      "follow-through": [
        "Record questions for Homer coaching tie-ins",
        "Capture audience feedback and review notes",
        "Log future merch/supporter ideas",
      ],
    },
  },
  {
    id: "episode-page",
    title: "HGO episode page",
    label: "Episode Page",
    priority: "primary",
    status: "queued",
    activeStage: "publish",
    notes:
      "Projection review, citation state, public-safe copy, page assets, and launch checklist.",
    stages: {
      source: [
        "Import staged projection packet",
        "Review citation state and source boundaries",
        "Confirm private manuscript material is excluded",
      ],
      shape: [
        "Review page title, summary, and key sections",
        "Map story beats to renderer blocks",
        "Mark blockers and review warnings",
      ],
      produce: [
        "Prepare pull quotes and supporting assets",
        "Generate social excerpt candidates",
        "Create final review artifact",
      ],
      publish: [
        "Validate public-safe status",
        "Align published page and discovery metadata",
        "Run published/discovery verification",
      ],
      "follow-through": [
        "Capture page analytics snapshot",
        "Record related offer or coaching CTA",
        "Queue follow-up content ideas",
      ],
    },
  },
  {
    id: "monetization",
    title: "Merch and supporter follow-through",
    label: "Monetization",
    priority: "secondary",
    status: "queued",
    activeStage: "source",
    notes:
      "Offer ideas only until WorldHub owns products, entitlements, provider adapters, and fulfillment.",
    stages: {
      source: [
        "Collect content moments that could become offers",
        "Separate product idea from provider implementation",
        "Record rights or public-safety concerns",
      ],
      shape: [
        "Draft offer promise and audience fit",
        "Connect idea to content project or episode",
        "List fulfillment assumptions",
      ],
      produce: [
        "Create copy sketch and asset needs",
        "Prepare review packet for WorldHub",
        "Block provider-specific build until approved",
      ],
      publish: [
        "Choose future target: Patreon, merch, embed, or site",
        "Prepare launch checklist without credentials",
        "Record provider adapter requirements",
      ],
      "follow-through": [
        "Track manual interest signals",
        "Capture coaching or community tie-ins",
        "Decide whether to promote into WorldHub backlog",
      ],
    },
  },
  {
    id: "coaching",
    title: "Homer coaching operations",
    label: "Coaching",
    priority: "secondary",
    status: "queued",
    activeStage: "source",
    notes:
      "Content-to-coaching ideas that should feed existing request and appointment workflows later.",
    stages: {
      source: [
        "Capture coaching questions raised by content",
        "Tie questions to episode, book, or talk context",
        "Keep private client data out of content projects",
      ],
      shape: [
        "Draft session theme or package idea",
        "Identify audience and intake prompts",
        "Map where current team console already handles it",
      ],
      produce: [
        "Create internal prep packet",
        "Prepare public-safe CTA copy",
        "List scheduling and follow-up needs",
      ],
      publish: [
        "Attach CTA to content project when approved",
        "Keep payment path external unless changed intentionally",
        "Record dashboard/team-console dependencies",
      ],
      "follow-through": [
        "Review requests created from the content",
        "Capture appointment and feedback signals",
        "Feed insights into the next content project",
      ],
    },
  },
];

function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTasks(labels: string[]) {
  return labels.map((label) => ({
    id: createId("task"),
    label,
    done: false,
  }));
}

function createProjectFromTemplate(template: ProjectTemplate): ContentStudioProject {
  const now = new Date().toISOString();

  return {
    id: createId("project"),
    title: template.title,
    kind: template.id,
    priority: template.priority,
    status: template.status,
    activeStage: template.activeStage,
    updatedAt: now,
    notes: template.notes,
    stages: {
      source: createTasks(template.stages.source),
      shape: createTasks(template.stages.shape),
      produce: createTasks(template.stages.produce),
      publish: createTasks(template.stages.publish),
      "follow-through": createTasks(template.stages["follow-through"]),
    },
  };
}

function createDefaultWorkspace(): ContentStudioWorkspace {
  const projects = projectTemplates
    .filter((template) => template.priority === "primary")
    .map(createProjectFromTemplate);

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    projects,
  };
}

function normalizeWorkspace(value: unknown): ContentStudioWorkspace | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const workspace = value as Partial<ContentStudioWorkspace>;

  if (
    workspace.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(workspace.projects)
  ) {
    return null;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt:
      typeof workspace.updatedAt === "string"
        ? workspace.updatedAt
        : new Date().toISOString(),
    projects: workspace.projects.filter(isContentStudioProject),
  };
}

function isContentStudioProject(value: unknown): value is ContentStudioProject {
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

function isProjectKind(value: unknown): value is ProjectKind {
  return (
    value === "podcast" ||
    value === "book" ||
    value === "episode-page" ||
    value === "monetization" ||
    value === "coaching"
  );
}

function isProjectPriority(value: unknown): value is ProjectPriority {
  return value === "primary" || value === "secondary" || value === "parking-lot";
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    value === "active" ||
    value === "queued" ||
    value === "blocked" ||
    value === "ready" ||
    value === "shipped"
  );
}

function isStageId(value: unknown): value is StageId {
  return stageDefinitions.some((stage) => stage.id === value);
}

function isStageRecord(value: unknown): value is Record<StageId, ContentStudioTask[]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<Record<StageId, unknown>>;

  return stageDefinitions.every((stage) => {
    const tasks = record[stage.id];

    return Array.isArray(tasks) && tasks.every(isContentStudioTask);
  });
}

function isContentStudioTask(value: unknown): value is ContentStudioTask {
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

function getProjectProgress(project: ContentStudioProject) {
  const tasks = stageDefinitions.flatMap((stage) => project.stages[stage.id]);
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;

  return {
    done,
    total,
    percentage: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function buildExportPacket(workspace: ContentStudioWorkspace, actorLabel: string) {
  return buildContentStudioBrowserPacket({
    workspace,
    actorLabel,
  });
}

function downloadJsonFile(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function countByStatus(projects: ContentStudioProject[]) {
  return projects.reduce(
    (summary, project) => {
      summary[project.status] += 1;
      return summary;
    },
    {
      active: 0,
      queued: 0,
      blocked: 0,
      ready: 0,
      shipped: 0,
    },
  );
}

function countByPriority(projects: ContentStudioProject[]) {
  return projects.reduce(
    (summary, project) => {
      summary[project.priority] += 1;
      return summary;
    },
    {
      primary: 0,
      secondary: 0,
      "parking-lot": 0,
    },
  );
}

export function ContentStudioClient({ actorLabel }: { actorLabel: string }) {
  const [workspace, setWorkspace] = useState(createDefaultWorkspace);
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => workspace.projects[0]?.id ?? "",
  );
  const [loaded, setLoaded] = useState(false);
  const [taskDraft, setTaskDraft] = useState("");
  const [importDraft, setImportDraft] = useState("");
  const [importMessage, setImportMessage] = useState<{
    tone: "source" | "review" | "danger";
    text: string;
  } | null>(null);
  const [serverSnapshotStatus, setServerSnapshotStatus] = useState(
    "Server checkpoints have not been checked in this browser.",
  );
  const [serverSnapshots, setServerSnapshots] = useState<ServerSnapshotSummary[]>(
    [],
  );
  const [isServerSnapshotBusy, setIsServerSnapshotBusy] = useState(false);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? normalizeWorkspace(JSON.parse(stored)) : null;

      if (parsed) {
        setWorkspace(parsed);
        setSelectedProjectId(parsed.projects[0]?.id ?? "");
      }
    } catch {
      setWorkspace(createDefaultWorkspace());
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        {
          ...workspace,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }, [loaded, workspace]);

  const selectedProject = useMemo(
    () =>
      workspace.projects.find((project) => project.id === selectedProjectId) ??
      workspace.projects[0],
    [selectedProjectId, workspace.projects],
  );

  const statusSummary = useMemo(
    () => countByStatus(workspace.projects),
    [workspace.projects],
  );

  const prioritySummary = useMemo(
    () => countByPriority(workspace.projects),
    [workspace.projects],
  );

  const exportJson = useMemo(
    () => JSON.stringify(buildExportPacket(workspace, actorLabel), null, 2),
    [actorLabel, workspace],
  );
  const selectedHandoff = useMemo(
    () =>
      selectedProject ? createContentStudioProjectHandoff(selectedProject) : null,
    [selectedProject],
  );
  const selectedProductionPacket = useMemo(
    () =>
      selectedProject ? createContentStudioProductionPacket(selectedProject) : null,
    [selectedProject],
  );
  const productionPacketJson = useMemo(
    () =>
      selectedProductionPacket
        ? JSON.stringify(selectedProductionPacket, null, 2)
        : "",
    [selectedProductionPacket],
  );

  function updateWorkspace(updater: (current: ContentStudioWorkspace) => ContentStudioWorkspace) {
    setWorkspace((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateSelectedProject(
    updater: (project: ContentStudioProject) => ContentStudioProject,
  ) {
    if (!selectedProject) {
      return;
    }

    updateWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === selectedProject.id
          ? { ...updater(project), updatedAt: new Date().toISOString() }
          : project,
      ),
    }));
  }

  function addProject(template: ProjectTemplate) {
    const project = createProjectFromTemplate(template);

    updateWorkspace((current) => ({
      ...current,
      projects: [project, ...current.projects],
    }));
    setSelectedProjectId(project.id);
  }

  function toggleTask(stageId: StageId, taskId: string) {
    updateSelectedProject((project) => ({
      ...project,
      stages: {
        ...project.stages,
        [stageId]: project.stages[stageId].map((task) =>
          task.id === taskId ? { ...task, done: !task.done } : task,
        ),
      },
    }));
  }

  function addTask(stageId: StageId) {
    const label = taskDraft.trim();

    if (!label) {
      return;
    }

    updateSelectedProject((project) => ({
      ...project,
      stages: {
        ...project.stages,
        [stageId]: [
          ...project.stages[stageId],
          {
            id: createId("task"),
            label,
            done: false,
          },
        ],
      },
    }));
    setTaskDraft("");
  }

  function resetToSamples() {
    const next = createDefaultWorkspace();
    setWorkspace(next);
    setSelectedProjectId(next.projects[0]?.id ?? "");
    setTaskDraft("");
    setImportMessage({
      tone: "review",
      text: "Sample workspace restored in browser local state.",
    });
  }

  function downloadExport() {
    downloadJsonFile(
      `content-studio-packet-${new Date().toISOString().slice(0, 10)}.json`,
      buildExportPacket(workspace, actorLabel),
    );
  }

  function downloadProductionPacket() {
    if (!selectedProductionPacket) {
      return;
    }

    downloadJsonFile(
      `content-studio-production-${selectedProductionPacket.projectKind}-${selectedProductionPacket.projectId}.json`,
      selectedProductionPacket,
    );
  }

  function downloadHgoProjectionDraft() {
    if (!selectedProductionPacket?.hgoProjectionDraft) {
      return;
    }

    downloadJsonFile(
      `hgo-projection-${selectedProductionPacket.hgoProjectionDraft.slug}.json`,
      selectedProductionPacket.hgoProjectionDraft,
    );
  }

  function copyToClipboard(label: string, value: string) {
    setClipboardMessage(null);

    if (!value.trim()) {
      setClipboardMessage(`${label} is empty.`);
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setClipboardMessage("Clipboard access is not available in this browser.");
      return;
    }

    void navigator.clipboard
      .writeText(value)
      .then(() => setClipboardMessage(`${label} copied to clipboard.`))
      .catch(() =>
        setClipboardMessage(
          `${label} copy failed. Download or select the JSON manually.`,
        ),
      );
  }

  function copyProductionPacket() {
    if (!productionPacketJson) {
      return;
    }

    copyToClipboard("Production packet", productionPacketJson);
  }

  function copyHgoProjectionDraft() {
    if (!selectedProductionPacket?.hgoProjectionDraft) {
      setClipboardMessage("No HGO projection draft exists for this project.");
      return;
    }

    copyToClipboard(
      "HGO projection draft",
      JSON.stringify(selectedProductionPacket.hgoProjectionDraft, null, 2),
    );
  }

  function copyProductionPacketAndOpenHgoImport() {
    if (!selectedProductionPacket?.hgoProjectionDraft || !productionPacketJson) {
      setClipboardMessage("No HGO projection draft exists for this project.");
      return;
    }

    copyToClipboard(
      "Production packet",
      productionPacketJson,
    );

    window.open(HGO_STAGE_IMPORT_HANDOFF_URL, "_blank", "noopener,noreferrer");
  }

  function importPacket() {
    const trimmed = importDraft.trim();

    if (!trimmed) {
      setImportMessage({
        tone: "danger",
        text: "Paste a Content Studio packet or raw workspace JSON first.",
      });
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setImportMessage({
        tone: "danger",
        text: "Import failed. The pasted text is not valid JSON.",
      });
      return;
    }

    const result = parseContentStudioPacket(parsed);

    if (!result.ok) {
      setImportMessage({
        tone: "danger",
        text: `Import blocked: ${result.errors.join(" ")}`,
      });
      return;
    }

    const next = {
      ...result.workspace,
      updatedAt: new Date().toISOString(),
    };

    setWorkspace(next);
    setSelectedProjectId(next.projects[0]?.id ?? "");
    setTaskDraft("");
    setImportDraft("");
    setImportMessage({
      tone: result.warnings.length > 0 ? "review" : "source",
      text:
        result.warnings.length > 0
          ? `Imported ${next.projects.length} projects. ${result.warnings.join(" ")}`
          : `Imported ${next.projects.length} projects from handoff packet.`,
    });
  }

  async function saveServerSnapshot() {
    setIsServerSnapshotBusy(true);
    setServerSnapshotStatus("Saving manual server checkpoint...");

    try {
      const response = await fetch("/api/content-studio/snapshots", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspace,
          title: "Content Studio workspace",
          description: `Manual checkpoint from ${actorLabel}.`,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        snapshot?: {
          id: string;
          projectCount: number;
          updatedAt: string;
        };
      } | null;

      if (!response.ok || !payload?.ok || !payload.snapshot) {
        throw new Error(
          payload?.message ?? "Content Studio checkpoint save failed.",
        );
      }

      setServerSnapshotStatus(
        `Saved checkpoint ${payload.snapshot.id} with ${payload.snapshot.projectCount} projects at ${formatDate(payload.snapshot.updatedAt)}.`,
      );
      setServerSnapshots(await fetchServerSnapshots());
    } catch (error) {
      setServerSnapshotStatus(
        error instanceof Error
          ? error.message
          : "Content Studio checkpoint save failed.",
      );
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  async function fetchServerSnapshots() {
    const response = await fetch("/api/content-studio/snapshots");
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      snapshots?: ServerSnapshotSummary[];
    } | null;

    if (!response.ok || !payload?.ok || !Array.isArray(payload.snapshots)) {
      throw new Error(
        payload?.message ?? "Content Studio checkpoint history load failed.",
      );
    }

    return payload.snapshots;
  }

  function loadSnapshotWorkspace(snapshot: ServerSnapshotDetail, label: string) {
    if (!snapshot.workspace) {
      setServerSnapshotStatus("No workspace was attached to that checkpoint.");
      return;
    }

    const result = parseContentStudioPacket(snapshot.workspace);

    if (!result.ok) {
      throw new Error(`Stored checkpoint was invalid: ${result.errors.join(" ")}`);
    }

    const next = {
      ...result.workspace,
      updatedAt: new Date().toISOString(),
    };

    setWorkspace(next);
    setSelectedProjectId(next.projects[0]?.id ?? "");
    setTaskDraft("");
    setServerSnapshotStatus(
      `Loaded ${label} checkpoint ${snapshot.id} from ${formatDate(snapshot.updatedAt)}.`,
    );
  }

  async function refreshServerSnapshotHistory() {
    setIsServerSnapshotBusy(true);
    setServerSnapshotStatus("Loading checkpoint history...");

    try {
      const snapshots = await fetchServerSnapshots();
      setServerSnapshots(snapshots);
      setServerSnapshotStatus(
        snapshots.length > 0
          ? `Loaded ${snapshots.length} checkpoint${snapshots.length === 1 ? "" : "s"}.`
          : "No server checkpoints have been saved yet.",
      );
    } catch (error) {
      setServerSnapshotStatus(
        error instanceof Error
          ? error.message
          : "Content Studio checkpoint history load failed.",
      );
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  async function loadLatestServerSnapshot() {
    setIsServerSnapshotBusy(true);
    setServerSnapshotStatus("Loading latest server checkpoint...");

    try {
      const response = await fetch("/api/content-studio/snapshots?latest=1");
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        snapshot?: ServerSnapshotDetail | null;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ?? "Content Studio checkpoint load failed.",
        );
      }

      if (!payload.snapshot?.workspace) {
        setServerSnapshotStatus("No server checkpoint has been saved yet.");
        return;
      }

      loadSnapshotWorkspace(payload.snapshot, "latest");
      setServerSnapshots(await fetchServerSnapshots());
    } catch (error) {
      setServerSnapshotStatus(
        error instanceof Error
          ? error.message
          : "Content Studio checkpoint load failed.",
      );
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  async function loadServerSnapshot(snapshotId: string) {
    setIsServerSnapshotBusy(true);
    setServerSnapshotStatus(`Loading checkpoint ${snapshotId}...`);

    try {
      const response = await fetch(
        `/api/content-studio/snapshots?id=${encodeURIComponent(snapshotId)}`,
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        snapshot?: ServerSnapshotDetail | null;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message ?? "Content Studio checkpoint load failed.",
        );
      }

      if (!payload.snapshot) {
        setServerSnapshotStatus("That checkpoint was not found.");
        return;
      }

      loadSnapshotWorkspace(payload.snapshot, "server");
    } catch (error) {
      setServerSnapshotStatus(
        error instanceof Error
          ? error.message
          : "Content Studio checkpoint load failed.",
      );
    } finally {
      setIsServerSnapshotBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="grid content-start gap-4 rounded-lg border border-studio-line bg-studio-panel/95 p-4 shadow-studio-panel">
        <section className="grid gap-3" aria-label="Content Studio summary">
          <div>
            <p className="m-0 text-[0.72rem] font-black uppercase leading-tight tracking-normal text-studio-dim">
              Queue
            </p>
            <h2 className="m-0 text-xl leading-tight tracking-normal text-studio-ink">
              {workspace.projects.length} projects
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Primary" value={prioritySummary.primary} tone="tag" />
            <Metric label="Secondary" value={prioritySummary.secondary} tone="source" />
            <Metric label="Active" value={statusSummary.active} tone="node" />
            <Metric label="Ready" value={statusSummary.ready} tone="review" />
          </div>
        </section>

        <section className="grid gap-2" aria-label="Create projects">
          <p className="m-0 text-[0.72rem] font-black uppercase leading-tight tracking-normal text-studio-dim">
            Templates
          </p>
          {projectTemplates.map((template) => (
            <button
              className="min-h-11 rounded-lg border border-studio-line bg-black/15 px-3 py-2 text-left text-sm font-black text-studio-ink hover:border-studio-tag/60 hover:bg-studio-tag/10"
              key={template.id}
              onClick={() => addProject(template)}
              title={`Create ${template.label} project`}
              type="button"
            >
              + {template.label}
            </button>
          ))}
        </section>

        <section className="grid gap-2" aria-label="Project list">
          <p className="m-0 text-[0.72rem] font-black uppercase leading-tight tracking-normal text-studio-dim">
            Active Board
          </p>
          <div className="grid gap-2">
            {workspace.projects.map((project) => {
              const progress = getProjectProgress(project);
              const isSelected = project.id === selectedProject?.id;

              return (
                <button
                  className={cn(
                    "grid gap-2 rounded-lg border px-3 py-2 text-left",
                    isSelected
                      ? "border-studio-tag/65 bg-studio-tag/10"
                      : "border-studio-line bg-black/15 hover:border-studio-tag/45",
                  )}
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  type="button"
                >
                  <span className="text-sm font-black leading-tight text-studio-ink">
                    {project.title}
                  </span>
                  <span className="font-mono text-[0.72rem] leading-tight text-studio-muted">
                    {projectKindLabel[project.kind]} / {progress.percentage}%
                  </span>
                  <Progress value={progress.percentage} />
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <section className="grid min-w-0 gap-4" aria-label="Selected project">
        {selectedProject ? (
          <>
            <ProjectHeader
              handoff={selectedHandoff}
              project={selectedProject}
              onProjectChange={updateSelectedProject}
              onReset={resetToSamples}
            />

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-4">
                <StageTabs
                  project={selectedProject}
                  onProjectChange={updateSelectedProject}
                />

                <div className="grid gap-3 lg:grid-cols-5">
                  {stageDefinitions.map((stage) => (
                    <StageColumn
                      active={selectedProject.activeStage === stage.id}
                      key={stage.id}
                      onAddTask={addTask}
                      onToggleTask={toggleTask}
                      stageId={stage.id}
                      taskDraft={taskDraft}
                      tasks={selectedProject.stages[stage.id]}
                      title={stage.label}
                      updateTaskDraft={setTaskDraft}
                    />
                  ))}
                </div>
              </div>

              <ExportPanel
                exportJson={exportJson}
                clipboardMessage={clipboardMessage}
                importDraft={importDraft}
                importMessage={importMessage}
                lastSaved={workspace.updatedAt}
                loaded={loaded}
                onCopyProductionPacketAndOpenHgoImport={
                  copyProductionPacketAndOpenHgoImport
                }
                onCopyHgoProjectionDraft={copyHgoProjectionDraft}
                onCopyProductionPacket={copyProductionPacket}
                isServerSnapshotBusy={isServerSnapshotBusy}
                onDownload={downloadExport}
                onDownloadHgoProjectionDraft={downloadHgoProjectionDraft}
                onDownloadProductionPacket={downloadProductionPacket}
                onImport={importPacket}
                onImportDraftChange={setImportDraft}
                onLoadLatestServerSnapshot={loadLatestServerSnapshot}
                onLoadServerSnapshot={loadServerSnapshot}
                onRefreshServerSnapshotHistory={refreshServerSnapshotHistory}
                onSaveServerSnapshot={saveServerSnapshot}
                productionPacket={selectedProductionPacket}
                productionPacketJson={productionPacketJson}
                serverSnapshots={serverSnapshots}
                serverSnapshotStatus={serverSnapshotStatus}
              />
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-studio-line bg-studio-panel/95 p-4 shadow-studio-panel">
            <p className="m-0 text-sm text-studio-muted">No projects loaded.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "tag" | "source" | "node" | "review";
}) {
  const toneClassName: Record<typeof tone, string> = {
    tag: "border-studio-tag/45 text-studio-tag",
    source: "border-studio-source/45 text-studio-source",
    node: "border-studio-node/45 text-studio-node",
    review: "border-studio-review/45 text-studio-review",
  };

  return (
    <div className={cn("rounded-lg border bg-black/15 p-3", toneClassName[tone])}>
      <p className="m-0 text-[0.72rem] font-black uppercase tracking-normal">
        {label}
      </p>
      <p className="m-0 mt-1 text-2xl font-black leading-none">{value}</p>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-lg bg-black/35">
      <div
        className="h-full rounded-lg bg-studio-tag"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function ProjectHeader({
  handoff,
  project,
  onProjectChange,
  onReset,
}: {
  handoff: ContentStudioProjectHandoff | null;
  project: ContentStudioProject;
  onProjectChange: (
    updater: (project: ContentStudioProject) => ContentStudioProject,
  ) => void;
  onReset: () => void;
}) {
  const progress = getProjectProgress(project);

  return (
    <section className="rounded-lg border border-studio-line bg-studio-panel/95 p-4 shadow-studio-panel">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="tag">{priorityLabel[project.priority]}</Badge>
            <Badge tone="source">{projectKindLabel[project.kind]}</Badge>
            <Badge tone={project.status === "blocked" ? "danger" : "review"}>
              {statusLabel[project.status]}
            </Badge>
          </div>

          <label className="grid gap-1">
            <span className="text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
              Title
            </span>
            <input
              className="min-h-12 rounded-lg border border-studio-line bg-black/20 px-3 text-xl font-black leading-tight text-studio-ink outline-none focus:border-studio-tag/65"
              onChange={(event) =>
                onProjectChange((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              value={project.title}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
              Notes
            </span>
            <textarea
              className="min-h-[86px] resize-y rounded-lg border border-studio-line bg-black/20 px-3 py-2 text-sm leading-relaxed text-studio-muted outline-none focus:border-studio-tag/65"
              onChange={(event) =>
                onProjectChange((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              value={project.notes}
            />
          </label>
        </div>

        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
                Status
              </span>
              <select
                className="min-h-11 rounded-lg border border-studio-line bg-black/20 px-3 text-sm font-bold text-studio-ink outline-none focus:border-studio-tag/65"
                onChange={(event) =>
                  onProjectChange((current) => ({
                    ...current,
                    status: event.target.value as ProjectStatus,
                  }))
                }
                value={project.status}
              >
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
                Priority
              </span>
              <select
                className="min-h-11 rounded-lg border border-studio-line bg-black/20 px-3 text-sm font-bold text-studio-ink outline-none focus:border-studio-tag/65"
                onChange={(event) =>
                  onProjectChange((current) => ({
                    ...current,
                    priority: event.target.value as ProjectPriority,
                  }))
                }
                value={project.priority}
              >
                {Object.entries(priorityLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-studio-line bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
                Progress
              </p>
              <span className="font-mono text-xs font-black text-studio-muted">
                {progress.done}/{progress.total}
              </span>
            </div>
            <div className="mt-3">
              <Progress value={progress.percentage} />
            </div>
            <p className="m-0 mt-2 font-mono text-xs text-studio-muted">
              Updated {formatDate(project.updatedAt)}
            </p>
          </div>

          {handoff ? (
            <div className="rounded-lg border border-studio-line bg-black/15 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={handoff.blocked ? "danger" : "source"}>
                  {handoff.blocked ? "Blocked" : "Next packet"}
                </Badge>
                {handoff.readyToPublish ? (
                  <Badge tone="review">Publish-ready</Badge>
                ) : null}
              </div>
              <p className="m-0 mt-3 text-sm font-black leading-tight text-studio-ink">
                {handoff.nextAction ?? "No open checkpoints"}
              </p>
              <p className="m-0 mt-2 text-xs leading-relaxed text-studio-muted">
                Included in every JSON export so another agent can pick up the
                project by stage, blocker, and next action.
              </p>
            </div>
          ) : null}

          <button
            className="min-h-11 rounded-lg border border-studio-danger/45 bg-studio-danger/10 px-3 text-sm font-black text-studio-danger"
            onClick={onReset}
            type="button"
          >
            Reset Samples
          </button>
        </div>
      </div>
    </section>
  );
}

function StageTabs({
  project,
  onProjectChange,
}: {
  project: ContentStudioProject;
  onProjectChange: (
    updater: (project: ContentStudioProject) => ContentStudioProject,
  ) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-studio-line bg-studio-panel/95 p-3 shadow-studio-panel md:grid-cols-5">
      {stageDefinitions.map((stage) => {
        const tasks = project.stages[stage.id];
        const done = tasks.filter((task) => task.done).length;
        const isActive = project.activeStage === stage.id;

        return (
          <button
            className={cn(
              "grid min-h-16 gap-1 rounded-lg border px-3 py-2 text-left",
              isActive
                ? "border-studio-tag/65 bg-studio-tag/10 text-studio-tag"
                : "border-studio-line bg-black/15 text-studio-muted hover:border-studio-tag/45",
            )}
            key={stage.id}
            onClick={() =>
              onProjectChange((current) => ({
                ...current,
                activeStage: stage.id,
              }))
            }
            type="button"
          >
            <span className="text-sm font-black leading-tight">{stage.label}</span>
            <span className="font-mono text-xs">
              {done}/{tasks.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StageColumn({
  active,
  onAddTask,
  onToggleTask,
  stageId,
  taskDraft,
  tasks,
  title,
  updateTaskDraft,
}: {
  active: boolean;
  onAddTask: (stageId: StageId) => void;
  onToggleTask: (stageId: StageId, taskId: string) => void;
  stageId: StageId;
  taskDraft: string;
  tasks: ContentStudioTask[];
  title: string;
  updateTaskDraft: (value: string) => void;
}) {
  const done = tasks.filter((task) => task.done).length;
  const percentage = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  return (
    <section
      className={cn(
        "grid min-h-[460px] content-start gap-3 rounded-lg border bg-studio-panel/95 p-3 shadow-studio-panel",
        active ? "border-studio-tag/55" : "border-studio-line",
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-base leading-tight tracking-normal text-studio-ink">
            {title}
          </h3>
          <span className="font-mono text-xs font-black text-studio-muted">
            {done}/{tasks.length}
          </span>
        </div>
        <div className="mt-2">
          <Progress value={percentage} />
        </div>
      </div>

      <div className="grid gap-2">
        {tasks.map((task) => (
          <label
            className="grid min-h-14 grid-cols-[auto_1fr] items-start gap-2 rounded-lg border border-studio-line bg-black/15 p-2 text-sm leading-snug text-studio-muted"
            key={task.id}
          >
            <input
              checked={task.done}
              className="mt-1 size-4 accent-studio-tag"
              onChange={() => onToggleTask(stageId, task.id)}
              type="checkbox"
            />
            <span className={cn(task.done && "text-studio-dim line-through")}>
              {task.label}
            </span>
          </label>
        ))}
      </div>

      {active ? (
        <form
          className="mt-auto grid gap-2 border-t border-studio-line pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onAddTask(stageId);
          }}
        >
          <input
            className="min-h-11 rounded-lg border border-studio-line bg-black/20 px-3 text-sm text-studio-ink outline-none focus:border-studio-tag/65"
            onChange={(event) => updateTaskDraft(event.target.value)}
            placeholder="Add checkpoint"
            value={taskDraft}
          />
          <button
            className="min-h-11 rounded-lg border border-studio-tag/55 bg-studio-tag/10 px-3 text-sm font-black text-studio-tag"
            type="submit"
          >
            Add Checkpoint
          </button>
        </form>
      ) : null}
    </section>
  );
}

function ExportPanel({
  clipboardMessage,
  exportJson,
  importDraft,
  importMessage,
  isServerSnapshotBusy,
  lastSaved,
  loaded,
  onCopyProductionPacketAndOpenHgoImport,
  onCopyHgoProjectionDraft,
  onCopyProductionPacket,
  onDownload,
  onDownloadHgoProjectionDraft,
  onDownloadProductionPacket,
  onImport,
  onImportDraftChange,
  onLoadLatestServerSnapshot,
  onLoadServerSnapshot,
  onRefreshServerSnapshotHistory,
  onSaveServerSnapshot,
  productionPacket,
  productionPacketJson,
  serverSnapshots,
  serverSnapshotStatus,
}: {
  clipboardMessage: string | null;
  exportJson: string;
  importDraft: string;
  importMessage: { tone: "source" | "review" | "danger"; text: string } | null;
  isServerSnapshotBusy: boolean;
  lastSaved: string;
  loaded: boolean;
  onCopyProductionPacketAndOpenHgoImport: () => void;
  onCopyHgoProjectionDraft: () => void;
  onCopyProductionPacket: () => void;
  onDownload: () => void;
  onDownloadHgoProjectionDraft: () => void;
  onDownloadProductionPacket: () => void;
  onImport: () => void;
  onImportDraftChange: (value: string) => void;
  onLoadLatestServerSnapshot: () => void;
  onLoadServerSnapshot: (snapshotId: string) => void;
  onRefreshServerSnapshotHistory: () => void;
  onSaveServerSnapshot: () => void;
  productionPacket: ContentStudioProductionPacket | null;
  productionPacketJson: string;
  serverSnapshots: ServerSnapshotSummary[];
  serverSnapshotStatus: string;
}) {
  return (
    <aside className="grid content-start gap-3 rounded-lg border border-studio-line bg-studio-panel/95 p-4 shadow-studio-panel">
      <div>
        <p className="m-0 text-[0.72rem] font-black uppercase leading-tight tracking-normal text-studio-dim">
          Handoff Packet
        </p>
        <h2 className="m-0 mt-1 text-xl leading-tight tracking-normal text-studio-ink">
          Browser export
        </h2>
      </div>

      <div className="grid gap-2">
        <Badge tone="tag">{loaded ? "Local state loaded" : "Loading"}</Badge>
        <Badge tone="source">Import / export ready</Badge>
        <Badge tone="review">Manual server checkpoints</Badge>
      </div>

      <section className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-3">
        <div>
          <p className="m-0 text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
            Server checkpoint
          </p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-studio-muted">
            Manual save/load for cross-device recovery. No autosave, provider
            call, or public publish action.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-lg border border-studio-source/55 bg-studio-source/10 px-3 text-sm font-black text-studio-source disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isServerSnapshotBusy}
            onClick={onSaveServerSnapshot}
            type="button"
          >
            Save Checkpoint
          </button>

          <button
            className="min-h-11 rounded-lg border border-studio-review/55 bg-studio-review/10 px-3 text-sm font-black text-studio-review disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isServerSnapshotBusy}
            onClick={onLoadLatestServerSnapshot}
            type="button"
          >
            Load Latest
          </button>
        </div>

        <button
          className="min-h-11 rounded-lg border border-studio-tag/55 bg-studio-tag/10 px-3 text-sm font-black text-studio-tag disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isServerSnapshotBusy}
          onClick={onRefreshServerSnapshotHistory}
          type="button"
        >
          Refresh History
        </button>

        {serverSnapshots.length > 0 ? (
          <div className="grid gap-2">
            {serverSnapshots.slice(0, 5).map((snapshot) => (
              <div
                className="grid gap-2 rounded-lg border border-studio-line bg-black/15 p-2"
                key={snapshot.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-black leading-tight text-studio-ink">
                    {snapshot.title}
                  </span>
                  <span className="font-mono text-[0.68rem] text-studio-muted">
                    {formatDate(snapshot.updatedAt)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="source">{snapshot.projectCount} projects</Badge>
                  <Badge tone="tag">{snapshot.activeCount} active</Badge>
                  <Badge tone="review">{snapshot.readyCount} ready</Badge>
                  {snapshot.blockedCount > 0 ? (
                    <Badge tone="danger">{snapshot.blockedCount} blocked</Badge>
                  ) : null}
                </div>
                <button
                  className="min-h-10 rounded-lg border border-studio-review/55 bg-studio-review/10 px-3 text-sm font-black text-studio-review disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isServerSnapshotBusy}
                  onClick={() => onLoadServerSnapshot(snapshot.id)}
                  type="button"
                >
                  Load This Checkpoint
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <p className="m-0 font-mono text-xs leading-relaxed text-studio-muted">
          {serverSnapshotStatus}
        </p>
      </section>

      {productionPacket ? (
        <section className="grid gap-3 rounded-lg border border-studio-line bg-black/15 p-3">
          <div>
            <p className="m-0 text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
              Production packet
            </p>
            <p className="m-0 mt-1 text-sm font-black leading-tight text-studio-ink">
              {productionPacket.workflow.replaceAll("-", " ")}
            </p>
          </div>

          <div className="grid gap-2">
            {productionPacket.deliveryTargets.map((target) => (
              <div
                className="rounded-lg border border-studio-line bg-black/15 p-2"
                key={target.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      target.status === "blocked"
                        ? "danger"
                        : target.status === "ready"
                          ? "review"
                          : "source"
                    }
                  >
                    {target.status}
                  </Badge>
                  <span className="text-sm font-black leading-tight text-studio-ink">
                    {target.label}
                  </span>
                </div>
                <p className="m-0 mt-2 text-xs leading-relaxed text-studio-muted">
                  {target.notes}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="min-h-11 rounded-lg border border-studio-tag/55 bg-studio-tag/10 px-3 text-sm font-black text-studio-tag"
              onClick={onCopyProductionPacket}
              type="button"
            >
              Copy Production
            </button>

            <button
              className="min-h-11 rounded-lg border border-studio-source/55 bg-studio-source/10 px-3 text-sm font-black text-studio-source"
              onClick={onDownloadProductionPacket}
              type="button"
            >
              Download
            </button>

            <button
              className="min-h-11 rounded-lg border border-studio-review/55 bg-studio-review/10 px-3 text-sm font-black text-studio-review disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!productionPacket.hgoProjectionDraft}
              onClick={onCopyHgoProjectionDraft}
              type="button"
            >
              Copy HGO Draft
            </button>

            <button
              className="min-h-11 rounded-lg border border-studio-review/55 bg-studio-review/10 px-3 text-sm font-black text-studio-review disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!productionPacket.hgoProjectionDraft}
              onClick={onDownloadHgoProjectionDraft}
              type="button"
            >
              Download HGO
            </button>
          </div>

          {productionPacket.hgoProjectionDraft ? (
            <div className="grid gap-2">
              <button
                className="min-h-11 rounded-lg border border-studio-node/55 bg-studio-node/10 px-3 text-sm font-black text-studio-node"
                onClick={onCopyProductionPacketAndOpenHgoImport}
                type="button"
              >
                Copy Packet + Open HGO
              </button>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-studio-line bg-black/15 px-3 text-center text-sm font-black text-studio-muted no-underline"
                href={HGO_STAGE_IMPORT_HANDOFF_URL}
                rel="noreferrer"
                target="_blank"
              >
                Open HGO Import Only
              </a>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-studio-line bg-black/15 px-3 text-center text-sm font-black text-studio-muted no-underline"
                href={HGO_PUBLISH_QUEUE_URL}
                rel="noreferrer"
                target="_blank"
              >
                Open Publish Queue
              </a>
            </div>
          ) : null}

          {clipboardMessage ? (
            <p className="m-0 rounded-lg border border-studio-line bg-black/15 p-2 text-xs font-bold leading-relaxed text-studio-muted">
              {clipboardMessage}
            </p>
          ) : null}

          <textarea
            className="min-h-[260px] resize-y rounded-lg border border-studio-line bg-black/25 p-3 font-mono text-[0.72rem] leading-relaxed text-studio-muted outline-none focus:border-studio-review/65"
            readOnly
            value={productionPacketJson}
          />
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          className="min-h-11 rounded-lg border border-studio-source/55 bg-studio-source/10 px-3 text-sm font-black text-studio-source"
          onClick={onDownload}
          type="button"
        >
          Download JSON
        </button>

        <button
          className="min-h-11 rounded-lg border border-studio-tag/55 bg-studio-tag/10 px-3 text-sm font-black text-studio-tag"
          onClick={onImport}
          type="button"
        >
          Import Packet
        </button>
      </div>

      <p className="m-0 font-mono text-xs leading-relaxed text-studio-muted">
        Saved {formatDate(lastSaved)}
      </p>

      {importMessage ? (
        <div className="rounded-lg border border-studio-line bg-black/15 p-3">
          <Badge tone={importMessage.tone}>{importMessage.text}</Badge>
        </div>
      ) : null}

      <label className="grid gap-1">
        <span className="text-[0.72rem] font-black uppercase tracking-normal text-studio-dim">
          Import packet
        </span>
        <textarea
          className="min-h-[160px] resize-y rounded-lg border border-studio-line bg-black/25 p-3 font-mono text-[0.72rem] leading-relaxed text-studio-muted outline-none focus:border-studio-tag/65"
          onChange={(event) => onImportDraftChange(event.target.value)}
          placeholder="Paste a Content Studio packet JSON export"
          value={importDraft}
        />
      </label>

      <textarea
        className="min-h-[420px] resize-y rounded-lg border border-studio-line bg-black/25 p-3 font-mono text-[0.72rem] leading-relaxed text-studio-muted outline-none focus:border-studio-source/65"
        readOnly
        value={exportJson}
      />
    </aside>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "tag" | "source" | "node" | "review" | "danger";
}) {
  const toneClassName: Record<typeof tone, string> = {
    tag: "border-studio-tag/45 text-studio-tag",
    source: "border-studio-source/45 text-studio-source",
    node: "border-studio-node/45 text-studio-node",
    review: "border-studio-review/45 text-studio-review",
    danger: "border-studio-danger/50 text-studio-danger",
  };

  return (
    <span
      className={cn(
        "inline-flex min-h-7 max-w-full items-center rounded-lg border bg-black/20 px-2 py-1 text-[0.72rem] font-extrabold uppercase leading-tight tracking-normal",
        toneClassName[tone],
      )}
    >
      {children}
    </span>
  );
}
