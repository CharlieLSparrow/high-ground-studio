export type SessionCaptureProfile = "coaching" | "episode";

export type SessionExperienceKind =
  | "coaching"
  | "episode"
  | "research"
  | "meeting";

export type SessionExperience = {
  kind: SessionExperienceKind;
  captureProfile: SessionCaptureProfile;
  purpose: "COACHING" | "PODCAST" | "RESEARCH_INTERVIEW" | "INTERNAL_MEETING";
  label: string;
  liveHeading: string;
  liveDescription: string;
  sessionScopeLabel: string;
  continuityLabel: string;
  continuityDescription: string;
  defaultCamera: boolean;
};

const EXPERIENCES: Record<SessionExperience["purpose"], SessionExperience> = {
  COACHING: {
    kind: "coaching",
    captureProfile: "coaching",
    purpose: "COACHING",
    label: "Coaching Session",
    liveHeading: "Start this coaching call",
    liveDescription: "Choose how you want to talk and listen, check that it sounds right, then join. Your client can use a browser or iPhone, and this Session keeps the recording, transcript, notes, goals, and tasks together.",
    sessionScopeLabel: "This coaching Session",
    continuityLabel: "Coaching continuity",
    continuityDescription: "Reviewed goals, commitments, private notes, and client-safe follow-up carry across Sessions without becoming public content.",
    defaultCamera: false,
  },
  PODCAST: {
    kind: "episode",
    captureProfile: "episode",
    purpose: "PODCAST",
    label: "Episode Recording",
    liveHeading: "Record the episode together from browser and iPhone",
    liveDescription: "Use a studio microphone and camera in the browser while iPhone Capture joins the same room. The live call, each retained local source, shared Watch, and the production timeline stay distinct but aligned.",
    sessionScopeLabel: "This recording Session",
    continuityLabel: "The whole episode",
    continuityDescription: "The Episode Room carries the manuscript, shared clips, episode-wide thread, milestones, editor, and publishing state across every recording Session.",
    defaultCamera: true,
  },
  RESEARCH_INTERVIEW: {
    kind: "research",
    captureProfile: "coaching",
    purpose: "RESEARCH_INTERVIEW",
    label: "Research Interview",
    liveHeading: "Run a source-safe interview from any device",
    liveDescription: "Choose the exact browser microphone or camera while another participant joins from iPhone. Consent, immutable sources, transcript evidence, annotations, and later writing uses remain traceable.",
    sessionScopeLabel: "This research interview",
    continuityLabel: "Research corpus",
    continuityDescription: "Reviewed transcript evidence, source annotations, citations, and writing uses can continue beyond the call without exposing private source material.",
    defaultCamera: false,
  },
  INTERNAL_MEETING: {
    kind: "meeting",
    captureProfile: "coaching",
    purpose: "INTERNAL_MEETING",
    label: "Team Meeting",
    liveHeading: "Work together from browser and iPhone",
    liveDescription: "Use the exact browser devices you want while teammates join from another browser or iPhone. The conversation, retained source, decisions, notes, and committed work stay separately reviewable.",
    sessionScopeLabel: "This team meeting",
    continuityLabel: "Team workspace",
    continuityDescription: "Reviewed decisions and commitments flow into shared notes, tasks, goals, calendar, and project context without treating chat as canonical work.",
    defaultCamera: false,
  },
};

export function normalizeSessionPurpose(value: unknown): SessionExperience["purpose"] {
  const purpose = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (purpose === "PODCAST" || purpose === "PODCAST_PRODUCTION" || purpose === "EPISODE") return "PODCAST";
  if (purpose === "RESEARCH_INTERVIEW" || purpose === "RESEARCH") return "RESEARCH_INTERVIEW";
  if (purpose === "INTERNAL_MEETING" || purpose === "MEETING") return "INTERNAL_MEETING";
  return "COACHING";
}

export function sessionExperienceForPurpose(value: unknown): SessionExperience {
  return EXPERIENCES[normalizeSessionPurpose(value)];
}
