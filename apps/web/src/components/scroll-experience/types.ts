/**
 * Defines the core format of the Scroll-Native Experience.
 * - STORYBOARD: Cinematic, image-focused layout for director pitches.
 * - COURSE: Interactive, SCORM-style educational modules with quizzes.
 * - PHOTOGRAPHY: Gallery view with draft overlays for client reviews.
 * - LORELIST: Typography-heavy snippets for story bible excerpts.
 * - COMIC: Panel-by-panel sequential art viewer.
 */
export type ExperienceType = 'STORYBOARD' | 'COURSE' | 'PHOTOGRAPHY' | 'LORELIST' | 'COMIC';

/**
 * Defines the content payload structure for an individual ScrollPanel.
 */
export type PanelType = 'MEDIA' | 'TEXT' | 'QUIZ' | 'NODE' | 'QUOTE';

/**
 * Supported interaction types that a user can perform on a panel or group.
 */
export type InteractionType = 'COMMENT' | 'RATING' | 'FAVORITE' | 'SELECTION' | 'COMPLETION';

/**
 * Represents a user interaction (like a comment or favorite) attached to a specific panel.
 */
export interface ScrollInteraction {
  id: string;
  experienceId: string;
  panelId?: string;
  userId: string;
  interactionType: InteractionType;
  payload: any;
  createdAt: string;
}

export interface ScrollPanel {
  id: string;
  groupId: string;
  type: PanelType;
  sourceId: string;
  order: number;
  content: {
    imageUrl?: string;
    videoUrl?: string;
    caption?: string;
    text?: string;
    quizData?: any;
    nodePayload?: any;
  };
  interactions: ScrollInteraction[];
}

export interface ScrollGroup {
  id: string;
  experienceId: string;
  title: string;
  order: number;
  layoutType: string;
  panels: ScrollPanel[];
}

export interface ScrollExperience {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  type: ExperienceType;
  settings: {
    theme: 'dark' | 'light' | 'cinematic';
    enableComments: boolean;
    enableSelections: boolean;
    requireCompletion: boolean;
  };
  groups: ScrollGroup[];
}

// Analytics and state definitions
export interface ViewerState {
  currentExperienceId: string;
  currentGroupId: string;
  currentPanelId: string;
  viewDurationMs: number;
  completedPanelIds: string[];
  selectedPanelIds: string[];
}
