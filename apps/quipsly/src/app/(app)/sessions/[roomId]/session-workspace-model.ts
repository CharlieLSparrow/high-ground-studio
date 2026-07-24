export const SESSION_WORKSPACE_MODES = [
  {
    id: "overview",
    label: "Overview",
    eyebrow: "Current truth",
    description: "See what exists, what is blocked, and where to continue.",
  },
  {
    id: "prepare",
    label: "Prepare",
    eyebrow: "Context and follow-through",
    description: "Carry notes, commitments, goals, tags, and unresolved evidence forward.",
  },
  {
    id: "recordings",
    label: "Recordings",
    eyebrow: "Immutable source",
    description: "Inspect source-media readiness, phone receipts, upload truth, and duration.",
  },
  {
    id: "transcript",
    label: "Transcript",
    eyebrow: "Listen and review",
    description: "Verify consent, correct source-backed text, and decide candidates explicitly.",
  },
  {
    id: "outputs",
    label: "Outputs",
    eyebrow: "Durable handoff",
    description: "Inspect Studio attachment receipts without confusing handoff with completion.",
  },
] as const;

export type SessionWorkspaceMode = (typeof SESSION_WORKSPACE_MODES)[number]["id"];

export function parseSessionWorkspaceMode(value: unknown): SessionWorkspaceMode {
  const candidate = Array.isArray(value) ? value[0] : value;
  return SESSION_WORKSPACE_MODES.some((mode) => mode.id === candidate)
    ? candidate as SessionWorkspaceMode
    : "overview";
}

export function sessionWorkspaceHref(roomId: string, mode: SessionWorkspaceMode) {
  return `/sessions/${encodeURIComponent(roomId)}?mode=${mode}`;
}

export function sessionWorkspaceDefinition(mode: SessionWorkspaceMode) {
  return SESSION_WORKSPACE_MODES.find((definition) => definition.id === mode)
    ?? SESSION_WORKSPACE_MODES[0];
}
