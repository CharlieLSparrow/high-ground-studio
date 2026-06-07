export type StoryEntityType =
  | "CHARACTER"
  | "SETTING"
  | "SCENE"
  | "RELATIONSHIP"
  | "TIMELINE_EVENT"
  | "THEME_MOTIF"
  | "BEAT";

export interface StoryEntityMention {
  id: string;
  entityId: string;
  documentId: string;
  blockId: string;
  snippet: string;
  createdAt: string;
}

export interface StoryEntity {
  id: string;
  projectId: string;
  type: StoryEntityType;
  name: string;
  aliases: string[];
  attributes: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  mentions?: StoryEntityMention[];
}

export type AssistantActionStatus = "PENDING" | "APPROVED" | "REJECTED" | "UNDONE";
export type AssistantActionType = "PROPOSE_ENTITY" | "PROPOSE_ENTITY_UPDATE" | "PROPOSE_RELATIONSHIP";

export interface StudioAssistantAction {
  id: string;
  projectId: string;
  documentId: string | null;
  type: AssistantActionType;
  status: AssistantActionStatus;
  payloadJson: Record<string, any>;
  explanation: string | null;
  riskLevel: string;
  createdAt: string;
  updatedAt: string;
}
