import { ScrollExperience, ScrollGroup, ScrollPanel, ScrollInteraction } from '../types';

export function transformDocumentToCourseExperience(
  document: any,
  interactions: any[] = []
): ScrollExperience {
  
  // Parse interactions
  const parsedInteractions = interactions.map(int => ({
    id: int.id,
    experienceId: int.experienceId,
    panelId: int.panelId || undefined,
    userId: int.userId || "guest",
    interactionType: int.interactionType as any,
    payload: int.payloadJson,
    createdAt: int.createdAt.toISOString()
  }));

  const groups: ScrollGroup[] = [];

  // Documents can have many blocks. For a course, we chunk them into "Lessons" or "Modules".
  // For now, we will group every 3-5 blocks into a module if they don't have explicit headers.
  // We'll sort blocks by order first.
  const blocks = [...(document.blocks || [])].sort((a, b) => a.order - b.order);
  
  const blocksPerModule = 4;
  for (let i = 0; i < blocks.length; i += blocksPerModule) {
    const chunk = blocks.slice(i, i + blocksPerModule);
    const groupId = `group-${document.id}-mod-${Math.floor(i / blocksPerModule)}`;
    
    groups.push({
      id: groupId,
      experienceId: document.id,
      title: chunk[0].title || `Module ${Math.floor(i / blocksPerModule) + 1}`,
      order: i / blocksPerModule,
      layoutType: 'HORIZONTAL_CAROUSEL', // swipe left/right for lessons in a module
      panels: chunk.map((block: any, index: number) => {
        
        // Very rudimentary check if this block is a quiz/poll
        const isQuiz = block.body.includes('?'); // Naive check for now
        
        return {
          id: block.id,
          groupId,
          type: isQuiz ? 'QUIZ' : 'TEXT',
          sourceId: block.id,
          order: index,
          content: {
            text: block.body,
            caption: block.title || undefined,
            // If it's a quiz, we would extract options from the body.
            // For MVP, if it has a question mark, mock some quiz options.
            quizData: isQuiz ? {
              question: block.body.split('?')[0] + '?',
              options: [
                { id: 'a', label: 'True' },
                { id: 'b', label: 'False' },
                { id: 'c', label: 'It Depends' }
              ]
            } : undefined
          },
          interactions: parsedInteractions.filter(int => int.panelId === block.id)
        } as ScrollPanel;
      })
    });
  }

  if (groups.length === 0) {
    groups.push({
      id: `group-empty`,
      experienceId: document.id,
      title: 'Empty Course',
      order: 0,
      layoutType: 'HORIZONTAL_CAROUSEL',
      panels: []
    });
  }

  return {
    id: document.id,
    projectId: document.projectId,
    title: document.title,
    description: `A generated course from document: ${document.title}`,
    type: 'COURSE',
    settings: {
      theme: 'dark',
      enableComments: true,
      enableSelections: false,
      requireCompletion: true,
    },
    groups,
  };
}
