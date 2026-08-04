import { normalizeSessionPurpose, type SessionExperience } from "@/lib/session-experience";

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
    eyebrow: "Session readiness",
    description: "Review schedule, participants, consent, project context, and canonical tags before capture.",
  },
  {
    id: "live",
    label: "Live room",
    eyebrow: "Talk together",
    description: "Choose studio devices, join from browser or iPhone, and keep conversation separate from retained recording truth.",
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
    id: "notes",
    label: "Notes",
    eyebrow: "Deliberate context",
    description: "Read and refine actor-owned Session notes without mixing them into committed work.",
  },
  {
    id: "work",
    label: "Work",
    eyebrow: "Goals and commitments",
    description: "Review canonical goals, tasks, evidence, focus blocks, and next-session continuity.",
  },
  {
    id: "outputs",
    label: "Outputs",
    eyebrow: "Durable handoff",
    description: "Inspect Studio attachment receipts without confusing handoff with completion.",
  },
] as const;

export type SessionWorkspaceMode = (typeof SESSION_WORKSPACE_MODES)[number]["id"];

type WorkspaceLanguage = Record<SessionWorkspaceMode, {
  label: string;
  eyebrow: string;
  description: string;
}>;

const PURPOSE_WORKSPACE_LANGUAGE: Record<SessionExperience["purpose"], WorkspaceLanguage> = {
  COACHING: {
    overview: { label: "Overview", eyebrow: "Coaching truth", description: "See readiness, private context, follow-through, and the safest next step." },
    prepare: { label: "Prepare", eyebrow: "Coaching preparation", description: "Review the client, schedule, consent, prior commitments, private context, and shared tags before the call." },
    live: { label: "Coaching room", eyebrow: "Meet together", description: "Choose the exact browser microphone or camera, join alongside iPhone participants, and keep the call separate from retained recording truth." },
    recordings: { label: "Recordings", eyebrow: "Private source", description: "Inspect source-media readiness, device receipts, upload truth, release state, and duration." },
    transcript: { label: "Review transcript", eyebrow: "Listen and verify", description: "Correct source-backed text, resolve speakers, and review proposed notes or commitments explicitly." },
    notes: { label: "Coaching notes", eyebrow: "Deliberate context", description: "Refine private, team, and client-safe notes without silently turning conversation into shared work." },
    work: { label: "Goals & commitments", eyebrow: "Shared follow-through", description: "Review canonical goals, tasks, evidence, focus blocks, and next-session continuity." },
    outputs: { label: "Follow-up", eyebrow: "Client-safe handoff", description: "Review what is safe to share, inspect delivery receipts, and keep internal notes private by default." },
  },
  PODCAST: {
    overview: { label: "Overview", eyebrow: "Episode recording truth", description: "See this take, its episode relationship, source readiness, and the production path ahead." },
    prepare: { label: "Run of show", eyebrow: "Episode preparation", description: "Review participants, consent, episode context, shared tags, clips, and the recording plan before going live." },
    live: { label: "Recording room", eyebrow: "Record together", description: "Choose studio devices in the browser while collaborators join from iPhone, with each retained source aligned to the same recording Session." },
    recordings: { label: "Takes", eyebrow: "Immutable sources", description: "Inspect every local and server source, capture receipt, upload, release gate, and duration before editing." },
    transcript: { label: "Edit transcript", eyebrow: "Listen and shape", description: "Correct source-backed text, resolve speakers, and review edit or production candidates without changing source media." },
    notes: { label: "Production notes", eyebrow: "Session decisions", description: "Keep take-specific observations and production decisions separate from the episode-wide thread and manuscript." },
    work: { label: "Episode work", eyebrow: "Production follow-through", description: "Review canonical episode tasks, goals, assignments, evidence, and scheduled production work." },
    outputs: { label: "Editor & publish", eyebrow: "Production handoff", description: "Inspect Studio attachment receipts, open the exact episode editor, and verify publishing state without treating handoff as completion." },
  },
  RESEARCH_INTERVIEW: {
    overview: { label: "Overview", eyebrow: "Interview truth", description: "See source readiness, consent, evidence status, and the research path ahead." },
    prepare: { label: "Source plan", eyebrow: "Interview preparation", description: "Review participants, consent, research questions, source context, and tags before the interview." },
    live: { label: "Interview room", eyebrow: "Interview together", description: "Choose exact browser devices while another participant joins from browser or iPhone, preserving source and consent boundaries." },
    recordings: { label: "Sources", eyebrow: "Immutable evidence", description: "Inspect recordings, device receipts, uploads, release state, and provenance before analysis." },
    transcript: { label: "Evidence transcript", eyebrow: "Listen and verify", description: "Correct source-backed text, resolve speakers, and review evidence candidates with stable source anchors." },
    notes: { label: "Research notes", eyebrow: "Interpret carefully", description: "Develop source-linked observations without confusing interpretation with the original evidence." },
    work: { label: "Findings & tasks", eyebrow: "Research follow-through", description: "Review findings, open questions, tasks, and goals that remain traceable to evidence." },
    outputs: { label: "Writing uses", eyebrow: "Cited handoff", description: "Inspect deliberate uses of reviewed evidence in writing or other outputs without exposing private source material." },
  },
  INTERNAL_MEETING: {
    overview: { label: "Overview", eyebrow: "Meeting truth", description: "See readiness, decisions, follow-through, and the safest next step." },
    prepare: { label: "Agenda", eyebrow: "Meeting preparation", description: "Review participants, schedule, consent, project context, agenda, and prior commitments." },
    live: { label: "Team room", eyebrow: "Work together", description: "Choose exact browser devices while teammates join from browser or iPhone, keeping conversation and retained source distinct." },
    recordings: { label: "Recordings", eyebrow: "Retained source", description: "Inspect source-media readiness, device receipts, uploads, release state, and duration." },
    transcript: { label: "Decision transcript", eyebrow: "Listen and verify", description: "Correct source-backed text, resolve speakers, and review proposed decisions or tasks explicitly." },
    notes: { label: "Meeting notes", eyebrow: "Shared context", description: "Refine deliberate notes without silently promoting chat or transcript text into canonical decisions." },
    work: { label: "Decisions & tasks", eyebrow: "Team follow-through", description: "Review canonical decisions, tasks, goals, assignments, and scheduled work." },
    outputs: { label: "Handoffs", eyebrow: "Durable continuation", description: "Inspect deliberate project handoffs and delivery receipts without treating a draft as completed work." },
  },
};

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

export function sessionWorkspaceDefinitionForPurpose(mode: SessionWorkspaceMode, purpose: unknown) {
  return PURPOSE_WORKSPACE_LANGUAGE[normalizeSessionPurpose(purpose)][mode];
}

export function sessionWorkspaceModesForPurpose(purpose: unknown) {
  const language = PURPOSE_WORKSPACE_LANGUAGE[normalizeSessionPurpose(purpose)];
  return SESSION_WORKSPACE_MODES.map(({ id }) => ({ id, ...language[id] }));
}
