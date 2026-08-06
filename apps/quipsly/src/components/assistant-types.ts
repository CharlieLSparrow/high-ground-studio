export type AssistantBlockContext = {
  id: string;
  text: string;
  tags?: string[];
};

export type AssistantSuggestion = {
  title: string;
  detail: string;
  confidence: number;
};

export type AssistantActionStatus =
  | "proposed"
  | "deciding"
  | "applying"
  | "applied"
  | "approved"
  | "rejected"
  | "undone"
  | "committing"
  | "committed"
  | "saved";

export type AssistantAction = {
  id: string;
  kind: string;
  label: string;
  explanation: string;
  riskLevel: "low" | "medium" | "high";
  payload: Record<string, unknown>;
  status: AssistantActionStatus;
  createdAt: string;
  governance?: {
    actionId: string;
    runId: string | null;
    capabilityId: string;
    decisionPolicy: string;
    decisionStatus: string;
    status: string;
    recovery?: unknown;
  };
};

export type AssistantPreviewCard = {
  id: string;
  actionId: string;
  title: string;
  kind: string;
  detail: string;
  items: Array<{ label: string; detail?: string; source?: string; href?: string }>;
  createdAt: string;
};

export type AssistantChange = {
  id: string;
  actionId: string;
  label: string;
  status: AssistantActionStatus;
  note: string;
  createdAt: string;
};

export type AssistantResponse = {
  ok: boolean;
  sessionId?: string;
  source?: string;
  assistantMessage?: string;
  suggestions?: AssistantSuggestion[];
  toolIntents?: Array<Omit<AssistantAction, "id" | "status" | "createdAt">>;
  actions?: AssistantAction[];
  warning?: string;
  error?: string;
};
