import React, { useRef, useEffect } from 'react';
import { useStoryBibleState, useStoryBibleDispatch } from './StoryBibleProvider';

export const EntityDetailCard: React.FC = React.memo(() => {
  const { entities, activeEntityId } = useStoryBibleState();
  const { setActiveEntity } = useStoryBibleDispatch();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  
  const entity = entities.find(e => e.id === activeEntityId);

  // Focus the back button when entering detail view for a11y
  useEffect(() => {
    if (activeEntityId && backButtonRef.current) {
      backButtonRef.current.focus();
    }
  }, [activeEntityId]);

  if (!entity) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center text-gray-500" role="status" aria-live="polite">
        <div className="text-4xl mb-3 opacity-20">👻</div>
        <p className="text-sm font-medium">Entity not found</p>
        <p className="text-xs text-gray-400 mt-1">It may have been deleted or never existed.</p>
        <button 
          onClick={() => setActiveEntity(null)}
          className="mt-6 text-blue-600 hover:text-blue-800 text-sm font-medium focus:outline-none focus:underline"
        >
          ← Return to Directory
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white shadow-lg relative">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 shrink-0 bg-white sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button 
            ref={backButtonRef}
            onClick={() => setActiveEntity(null)}
            className="text-gray-400 hover:text-gray-900 p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Back to directory"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{entity.name}</h2>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{entity.type.replace(/_/g, ' ')}</span>
          </div>
        </div>
        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors">
          Edit
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* Aliases */}
        {entity.aliases && entity.aliases.length > 0 && (
          <section aria-labelledby="section-aliases">
            <h3 id="section-aliases" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Also Known As</h3>
            <div className="flex flex-wrap gap-2" role="list">
              {entity.aliases.map(alias => (
                <span key={alias} role="listitem" className="px-2 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-md border border-gray-200 shadow-sm">
                  {alias}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Description / Notes */}
        {entity.attributes.description && (
          <section aria-labelledby="section-desc">
            <h3 id="section-desc" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {entity.attributes.description}
            </p>
          </section>
        )}

        {/* Dynamic Attributes Grid */}
        {Object.keys(entity.attributes).filter(k => k !== 'description' && k !== 'notes').length > 0 && (
          <section aria-labelledby="section-details">
            <h3 id="section-details" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Details</h3>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-4 shadow-inner">
              {Object.entries(entity.attributes)
                .filter(([k]) => k !== 'description' && k !== 'notes')
                .map(([key, value]) => (
                  <div key={key}>
                    <span className="block text-xs font-semibold text-gray-500 capitalize mb-1">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="block text-sm text-gray-900 leading-relaxed">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
              ))}
            </div>
          </section>
        )}

        {/* Mentions Feed */}
        <section aria-labelledby="section-mentions">
          <h3 id="section-mentions" className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>Manuscript Mentions</span>
            <span className="bg-gray-100 text-gray-600 font-medium py-0.5 px-2 rounded-full border border-gray-200">
              {entity.mentions.length}
            </span>
          </h3>
          
          {entity.mentions.length === 0 ? (
            <div className="text-center p-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
              <p className="text-sm text-gray-500 font-medium">No mentions yet</p>
              <p className="text-xs text-gray-400 mt-1">When this entity is tagged in your manuscript, the excerpts will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3" role="list">
              {entity.mentions.map(mention => (
                <div key={mention.id} role="listitem" tabIndex={0} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer group">
                  <p className="text-sm text-gray-700 leading-relaxed font-serif italic">
                    "...{mention.snippet.replace(entity.name, `**${entity.name}**`)}..."
                  </p>
                  <div className="mt-3 flex justify-between items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                     <span className="text-xs text-gray-400 font-medium">Document ID: {mention.documentId}</span>
                     <span className="text-xs text-blue-600 font-bold flex items-center">
                       Jump to block
                       <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                     </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
});
