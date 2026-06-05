export type EntityType = 'CHARACTER' | 'SETTING' | 'SCENE' | 'RELATIONSHIP' | 'TIMELINE_EVENT' | 'THEME_MOTIF';

export interface StoryEntityMention {
  id: string;
  entityId: string;
  documentId: string;
  blockId: string;
  snippet: string;
  createdAt: string;
}

export interface BaseEntityAttributes {
  description?: string;
  notes?: string;
  [key: string]: any;
}

export interface CharacterAttributes extends BaseEntityAttributes {
  age?: string;
  appearance?: string;
  goals?: string;
  conflicts?: string;
}

export interface SettingAttributes extends BaseEntityAttributes {
  location?: string;
  timePeriod?: string;
  sensoryDetails?: string[];
}

export interface StoryEntity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  attributes: BaseEntityAttributes | CharacterAttributes | SettingAttributes;
  createdAt: string;
  updatedAt: string;
  mentions: StoryEntityMention[];
}

export type ActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDONE';

// -----------------------------------------------------------------------------
// AI ACTIONS & PAYLOADS (Discriminated Union)
// -----------------------------------------------------------------------------

export interface BaseAssistantAction {
  id: string;
  projectId: string;
  documentId?: string;
  status: ActionStatus;
  explanation: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt: string;
}

export interface ProposeEntityAction extends BaseAssistantAction {
  type: 'PROPOSE_ENTITY';
  payload: StoryEntity; // Must be a complete valid entity to add
}

export interface ProposeEntityUpdateAction extends BaseAssistantAction {
  type: 'PROPOSE_ENTITY_UPDATE';
  payload: {
    id: string; // The entity to update
    updates: Partial<StoryEntity>;
  };
}

export interface ProposeRelationshipAction extends BaseAssistantAction {
  type: 'PROPOSE_RELATIONSHIP';
  payload: Relationship;
}

export type AssistantAction = 
  | ProposeEntityAction 
  | ProposeEntityUpdateAction 
  | ProposeRelationshipAction;

// More types to hit our structural goals
export interface TimelineEvent {
  id: string;
  name: string;
  dateStr: string;
  description: string;
  participants: string[]; // entity IDs
}

export interface Scene {
  id: string;
  name: string;
  settingId: string;
  charactersPresent: string[];
  povCharacterId?: string;
  summary: string;
}

// We add exhaustive mock types for the front-end to develop against without hitting the backend.
export interface Relationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: 'FRIEND' | 'ENEMY' | 'FAMILY' | 'ROMANTIC' | 'RIVAL' | 'OTHER';
  description: string;
  evolution: string;
}

export interface ThemeMotif {
  id: string;
  name: string;
  description: string;
  occurrences: StoryEntityMention[];
}

// Extensibility interfaces for future AI features
export interface AnalysisReport {
  id: string;
  documentId: string;
  type: 'FICTION_PACING' | 'FICTION_POV' | 'NONFICTION_CLAIMS';
  summary: string;
  details: Record<string, any>;
  generatedAt: string;
}
