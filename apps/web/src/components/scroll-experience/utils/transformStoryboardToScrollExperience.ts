import { ScrollExperience, ScrollGroup, ScrollPanel, ExperienceType, ScrollInteraction } from '../types';

export function transformStoryboardToScrollExperience(
  storyboard: any,
  interactions: any[],
  type: ExperienceType = 'STORYBOARD'
): ScrollExperience {
  
  // Transform db interactions to our schema
  const parsedInteractions = interactions.map(int => ({
    id: int.id,
    experienceId: int.experienceId,
    panelId: int.panelId || undefined,
    userId: int.userId || "guest",
    interactionType: int.interactionType as any,
    payload: int.payloadJson,
    createdAt: int.createdAt.toISOString()
  }));

  // Helper to construct a panel
  const createPanel = (frame: any, index: number, groupId: string): ScrollPanel => ({
    id: frame.id,
    groupId,
    type: 'MEDIA',
    sourceId: frame.id,
    order: index,
    content: {
      imageUrl: frame.imageUrl || undefined,
      text: frame.dialogue || frame.action || undefined,
      caption: `Frame ${frame.frameNumber} • ${frame.shotSize} • ${frame.cameraInfo}`,
    },
    interactions: parsedInteractions.filter(int => int.panelId === frame.id)
  });

  const groups: ScrollGroup[] = [];

  // STORYBOARD & PHOTOGRAPHY: 
  // Typically flow as one massive strip or carousel. We map all frames into a single group.
  if (type === 'STORYBOARD' || type === 'PHOTOGRAPHY') {
    const groupId = `group-${storyboard.id}`;
    groups.push({
      id: groupId,
      experienceId: storyboard.id,
      title: type === 'STORYBOARD' ? storyboard.title : 'Gallery',
      order: 0,
      layoutType: type === 'STORYBOARD' ? 'HORIZONTAL_CAROUSEL' : 'VERTICAL_STACK',
      panels: storyboard.frames.map((frame: any, index: number) => createPanel(frame, index, groupId))
    });
  }
  // COMIC: 
  // We can group panels by scenes/acts if they have metadata, or chunk them every 10 panels for "pages"
  else if (type === 'COMIC') {
    const panelsPerPage = 8;
    for (let i = 0; i < storyboard.frames.length; i += panelsPerPage) {
      const chunk = storyboard.frames.slice(i, i + panelsPerPage);
      const groupId = `group-${storyboard.id}-page-${i / panelsPerPage}`;
      groups.push({
        id: groupId,
        experienceId: storyboard.id,
        title: `Scene ${Math.floor(i / panelsPerPage) + 1}`,
        order: i / panelsPerPage,
        layoutType: 'VERTICAL_SNAP',
        panels: chunk.map((frame: any, index: number) => createPanel(frame, index, groupId))
      });
    }
  }
  // COURSE & LORELIST:
  // Chunking by 5 panels for "modules" or "entries"
  else {
    const panelsPerModule = 5;
    for (let i = 0; i < storyboard.frames.length; i += panelsPerModule) {
      const chunk = storyboard.frames.slice(i, i + panelsPerModule);
      const groupId = `group-${storyboard.id}-mod-${i / panelsPerModule}`;
      groups.push({
        id: groupId,
        experienceId: storyboard.id,
        title: `Module ${Math.floor(i / panelsPerModule) + 1}`,
        order: i / panelsPerModule,
        layoutType: 'HORIZONTAL_CAROUSEL',
        panels: chunk.map((frame: any, index: number) => createPanel(frame, index, groupId))
      });
    }
  }

  // Ensure there's at least one group if the storyboard is completely empty
  if (groups.length === 0) {
    groups.push({
      id: `group-empty`,
      experienceId: storyboard.id,
      title: 'Empty',
      order: 0,
      layoutType: 'HORIZONTAL_CAROUSEL',
      panels: []
    });
  }

  return {
    id: storyboard.id,
    projectId: storyboard.projectId,
    title: storyboard.title,
    description: storyboard.description || undefined,
    type,
    settings: {
      theme: type === 'STORYBOARD' ? 'cinematic' : (type === 'PHOTOGRAPHY' ? 'light' : 'dark'),
      enableComments: true,
      enableSelections: type === 'PHOTOGRAPHY' || type === 'STORYBOARD',
      requireCompletion: type === 'COURSE',
    },
    groups,
  };
}
