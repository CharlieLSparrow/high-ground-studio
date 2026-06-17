import { ScrollExperience, ScrollGroup, ScrollPanel } from '../types';

export function transformComicSeedToScrollExperience(seed: any): ScrollExperience {
  const groups: ScrollGroup[] = seed.sections.map((section: any, sectionIndex: number) => {
    
    // Map panels inside this section
    const panels: ScrollPanel[] = section.panelIds.map((panelId: string, panelIndex: number) => {
      const panelData = seed.panels.find((p: any) => p.id === panelId);
      
      if (!panelData) return null;

      // Naive parser to split captionOrDialogue into caption (narration) and text (dialogue)
      const fullText = panelData.captionOrDialogue || "";
      const lines = fullText.split('\n');
      let caption = "";
      let text = "";

      lines.forEach((line: string) => {
        if (line.toLowerCase().includes('narration') || line.toLowerCase().includes('system text')) {
          caption += line.split(':').slice(1).join(':').trim() + "\n";
        } else if (line.includes(':')) {
          text += line.split(':').slice(1).join(':').trim() + "\n";
        } else {
          text += line.trim() + "\n";
        }
      });

      return {
        id: panelData.id,
        groupId: section.id,
        sourceId: panelData.id,
        type: 'MEDIA',
        order: panelIndex,
        content: {
          // If there is no image, we will pass the imagePrompt as a placeholder text trick
          // The ComicAdapter expects imageUrl, but if we pass a generic placeholder or omit it, we can still render text.
          // For now, let's put the image prompt into the text as a Director's Note
          caption: caption.trim() || undefined,
          text: text.trim() || `[Prompt: ${panelData.imagePrompt}]`,
          // We could use an unsplash placeholder or leave it blank
          imageUrl: `https://source.unsplash.com/random/1080x1920?scifi,space&sig=${panelIndex}`
        },
        interactions: []
      } as ScrollPanel;
    }).filter(Boolean) as ScrollPanel[];

    return {
      id: section.id,
      experienceId: seed.issueSlug || 'comic-seed',
      order: sectionIndex,
      title: section.label,
      layoutType: 'fullscreen',
      panels
    } as ScrollGroup;
  });

  return {
    id: seed.issueSlug || 'comic-seed',
    projectId: seed.projectSlug || 'private',
    type: 'COMIC',
    title: seed.experience?.title || 'Comic Issue',
    settings: {
      theme: 'cinematic',
      enableComments: true,
      enableSelections: false,
      requireCompletion: false
    },
    groups
  };
}
