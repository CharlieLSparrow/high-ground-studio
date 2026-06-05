import React, { useState, useEffect } from 'react';
import { useStoryBibleState, useStoryBibleDispatch, useStoryBibleEntitiesByType } from './StoryBibleProvider';
import { EntityType, StoryEntity } from './StoryBibleTypes';

const ENTITY_CATEGORIES: { label: string; type: EntityType }[] = [
  { label: 'Characters', type: 'CHARACTER' },
  { label: 'Settings', type: 'SETTING' },
  { label: 'Scenes', type: 'SCENE' },
  { label: 'Relationships', type: 'RELATIONSHIP' },
  { label: 'Timeline', type: 'TIMELINE_EVENT' },
  { label: 'Themes & Motifs', type: 'THEME_MOTIF' },
];

const CategorySection = React.memo(({ 
  category, 
  searchQuery,
  expandedCategory,
  toggleCategory 
}: { 
  category: { label: string; type: EntityType };
  searchQuery: string;
  expandedCategory: EntityType | null;
  toggleCategory: (type: EntityType) => void;
}) => {
  const { activeEntityId } = useStoryBibleState();
  const { setActiveEntity } = useStoryBibleDispatch();
  const rawEntities = useStoryBibleEntitiesByType(category.type);

  let entities = rawEntities;
  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    entities = entities.filter(e => 
      e.name.toLowerCase().includes(lowerQuery) || 
      e.aliases.some(a => a.toLowerCase().includes(lowerQuery))
    );
  }

  const isExpanded = expandedCategory === category.type || (searchQuery && entities.length > 0);

  const renderEntityItem = (entity: StoryEntity) => {
    const isSelected = activeEntityId === entity.id;
    return (
      <button 
        key={entity.id}
        onClick={() => setActiveEntity(entity.id)}
        aria-selected={isSelected}
        role="tab"
        tabIndex={0}
        className={`w-full text-left p-2 cursor-pointer text-sm rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500
          ${isSelected ? 'bg-blue-100 text-blue-900 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
      >
        <div className="flex justify-between items-center">
          <span>{entity.name}</span>
          {entity.mentions.length > 0 && (
            <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full" aria-label={`${entity.mentions.length} mentions`}>
              {entity.mentions.length}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="mb-2">
      <button
        onClick={() => toggleCategory(category.type)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleCategory(category.type); }}
        aria-expanded={!!isExpanded}
        aria-controls={`panel-${category.type}`}
        id={`tab-${category.type}`}
        className="w-full flex items-center justify-between p-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span>{category.label}</span>
        <span className="text-xs text-gray-400" aria-hidden="true">
          {entities.length} {isExpanded ? '▼' : '▶'}
        </span>
      </button>
      
      {isExpanded && entities.length > 0 && (
        <div 
          id={`panel-${category.type}`} 
          role="tabpanel" 
          aria-labelledby={`tab-${category.type}`} 
          className="mt-1 pl-4 pr-1 space-y-1"
        >
          {entities.map(renderEntityItem)}
        </div>
      )}
      {isExpanded && entities.length === 0 && !searchQuery && (
        <div 
          id={`panel-${category.type}-empty`} 
          className="mt-1 pl-4 pr-1 text-xs text-gray-400 italic py-2"
        >
          No {category.label.toLowerCase()} added yet.
        </div>
      )}
    </div>
  );
});

export const EntityDirectory = React.memo(() => {
  const [expandedCategory, setExpandedCategory] = useState<EntityType | null>('CHARACTER');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input for performance during rapid typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const toggleCategory = (type: EntityType) => {
    setExpandedCategory(prev => (prev === type ? null : type));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-200 shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Story Bible</h2>
        <input 
          type="search"
          placeholder="Search entities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search story bible entities"
          className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2" role="tablist" aria-label="Entity Categories">
        {ENTITY_CATEGORIES.map(category => (
          <CategorySection 
            key={category.type}
            category={category}
            searchQuery={debouncedSearch}
            expandedCategory={expandedCategory}
            toggleCategory={toggleCategory}
          />
        ))}
      </div>

      <div className="p-4 border-t border-gray-200 shrink-0">
        <button className="w-full py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
          + Add New Entity
        </button>
      </div>
    </div>
  );
});
