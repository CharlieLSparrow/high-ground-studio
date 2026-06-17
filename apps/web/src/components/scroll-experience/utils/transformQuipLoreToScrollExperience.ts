import { ScrollExperience, ScrollGroup, ScrollPanel } from '../types';

export function transformQuipLoreToScrollExperience(
  collection: any
): ScrollExperience {
  const groups: ScrollGroup[] = [];
  
  // For a Lorelist, we group quotes into a single vertical strip to allow continuous horizontal swiping.
  // We sort quotes alphabetically by author name, then by created date as a fallback.
  // If the collection is massive, we could chunk it by Themes or Authors, but for now a single horizontal group is preferred for pure swipe-reading.
  const sortedQuotes = [...(collection.quotes || [])].sort((a, b) => {
    const authorA = a.author?.name || 'Unknown';
    const authorB = b.author?.name || 'Unknown';
    if (authorA < authorB) return -1;
    if (authorA > authorB) return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const panels: ScrollPanel[] = sortedQuotes.map((quote: any, index: number) => ({
    id: quote.id,
    groupId: 'group-lore-1',
    type: 'QUOTE',
    sourceId: quote.id,
    order: index,
    content: {
      text: quote.text,
      nodePayload: {
        author: quote.author?.name || 'Unknown Author',
        source: quote.source?.title || quote.work?.title || 'Unknown Source',
        tags: quote.tags?.map((t: any) => t.name) || [],
      }
    },
    interactions: [] // We'll populate this later from DB if needed
  }));

  groups.push({
    id: 'group-lore-1',
    experienceId: collection.id,
    title: collection.title,
    order: 0,
    layoutType: 'HORIZONTAL_CAROUSEL',
    panels
  });

  return {
    id: collection.id,
    projectId: collection.projectId,
    title: collection.title,
    description: collection.description || `A curated collection of lore and quotes.`,
    type: 'LORELIST',
    settings: {
      theme: 'dark',
      enableComments: true,
      enableSelections: true,
      requireCompletion: false
    },
    groups
  };
}
