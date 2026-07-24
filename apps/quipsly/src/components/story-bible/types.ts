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

export type AssistantActionStatus = "proposed" | "approved";
export type AssistantActionType = "PROPOSE_ENTITY" | "PROPOSE_ENTITY_UPDATE";

export interface StudioAssistantAction {
  id: string;
  kind: AssistantActionType;
  label: string;
  status: AssistantActionStatus;
  payloadJson: Record<string, any>;
  explanation: string | null;
  riskLevel: string;
  createdAt: string;
  updatedAt: string;
}
