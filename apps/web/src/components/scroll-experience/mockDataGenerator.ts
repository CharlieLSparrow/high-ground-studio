import { ScrollExperience, ScrollGroup, ScrollPanel, ExperienceType, PanelType } from './types';

export function generateMockExperience(type: ExperienceType, groupCount: number = 10, panelsPerGroup: number = 10): ScrollExperience {
  const groups: ScrollGroup[] = [];

  for (let g = 0; g < groupCount; g++) {
    const panels: ScrollPanel[] = [];
    for (let p = 0; p < panelsPerGroup; p++) {
      const panelId = `pnl_${g}_${p}`;

      let content = {};
      let panelType: PanelType = 'MEDIA';

      switch (type) {
        case 'STORYBOARD':
          content = {
            imageUrl: `https://placehold.co/1280x720/111/fff?text=Scene+${g + 1}+Shot+${p + 1}`,
            caption: `Camera pans left. Character enters frame. Shot ${p + 1} of Scene ${g + 1}.`,
          };
          break;
        case 'PHOTOGRAPHY':
          content = {
            imageUrl: `https://placehold.co/800x1200/${g}${p}${g}/fff?text=Photo+${g}-${p}`,
            caption: `Client look #${g + 1}, Frame ${p + 1}`,
          };
          break;
        case 'COURSE':
          panelType = p % 3 === 0 ? 'QUIZ' : (p % 2 === 0 ? 'MEDIA' : 'TEXT');
          content = {
            text: panelType === 'TEXT' ? `This is lesson text for module ${g + 1} part ${p + 1}. Read carefully.` : undefined,
            imageUrl: panelType === 'MEDIA' ? `https://placehold.co/1080x1080/222/eee?text=Video+Lesson+${g + 1}-${p + 1}` : undefined,
            quizData: panelType === 'QUIZ' ? { question: `Did you understand part ${p}?`, options: ['Yes', 'No'] } : undefined,
            caption: `Module ${g + 1}, Step ${p + 1}`,
          };
          break;
        case 'LORELIST':
          panelType = 'QUOTE';
          content = {
            text: `"The galaxy is vast, but this sector is ours." - Unknown Commander (Entry ${g}-${p})`,
            nodePayload: { tags: ['#lore', '#faction'] }
          };
          break;
        case 'COMIC':
          content = {
            imageUrl: `https://placehold.co/1080x1920/1a1a2e/e94560?text=Comic+Panel+${g + 1}-${p + 1}`,
            text: p % 2 === 0 ? `"Wait, what did you just say?"` : `"I said... we're not alone out here."`,
            caption: p === 0 ? 'MEANWHILE, ON SECTOR 4...' : undefined,
          };
          break;
        default:
          content = { caption: `Generic panel ${p}` };
      }

      panels.push({
        id: panelId,
        groupId: `grp_${g}`,
        type: panelType,
        sourceId: `src_${g}_${p}`,
        order: p,
        content,
        interactions: generateMockInteractions(panelId, type),
      });
    }

    groups.push({
      id: `grp_${g}`,
      experienceId: `exp_mock_${type}`,
      title: type === 'STORYBOARD' ? `Scene ${g + 1}` : (type === 'COURSE' ? `Module ${g + 1}` : `Group ${g + 1}`),
      order: g,
      layoutType: 'HORIZONTAL_CAROUSEL',
      panels,
    });
  }

  return {
    id: `exp_mock_${type}`,
    projectId: 'proj_demo',
    title: `Mock ${type} Experience`,
    description: `A generated presentation featuring ${groupCount} groups and ${groupCount * panelsPerGroup} panels.`,
    type,
    settings: {
      theme: type === 'STORYBOARD' ? 'cinematic' : 'dark',
      enableComments: true,
      enableSelections: type === 'PHOTOGRAPHY' || type === 'STORYBOARD',
      requireCompletion: type === 'COURSE',
    },
    groups,
  };
}

function generateMockInteractions(panelId: string, type: ExperienceType) {
  const interactions = [];
  // Random chance to have comments or favorites
  if (Math.random() > 0.7) {
    interactions.push({
      id: `int_${Math.random().toString(36).substring(7)}`,
      experienceId: `exp_mock_${type}`,
      panelId,
      userId: 'user_director',
      interactionType: 'COMMENT' as const,
      payload: { text: "Can we push in a bit tighter on this?" },
      createdAt: new Date(Date.now() - Math.random() * 10000000).toISOString(),
    });
  }
  if (Math.random() > 0.8) {
    interactions.push({
      id: `int_${Math.random().toString(36).substring(7)}`,
      experienceId: `exp_mock_${type}`,
      panelId,
      userId: 'user_client',
      interactionType: 'FAVORITE' as const,
      payload: { active: true },
      createdAt: new Date().toISOString(),
    });
  }
  return interactions;
}
