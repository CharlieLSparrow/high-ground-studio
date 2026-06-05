import React, { useMemo } from 'react';
import { useStoryBibleState, useStoryBibleDispatch } from './StoryBibleProvider';
import { AssistantAction } from './StoryBibleTypes';

export const AssistantInbox: React.FC = React.memo(() => {
  const { actions } = useStoryBibleState();
  const { approveAction, rejectAction, undoAction } = useStoryBibleDispatch();

  // Memoize the derived arrays so we don't recompute on every render
  const { pendingActions, pastActions } = useMemo(() => {
    return {
      pendingActions: actions.filter(a => a.status === 'PENDING'),
      pastActions: actions.filter(a => a.status !== 'PENDING')
    };
  }, [actions]);

  const renderActionCard = (action: AssistantAction, isHistory = false) => {
    return (
      <div 
        key={action.id} 
        role="article"
        aria-labelledby={`action-title-${action.id}`}
        className={`p-4 border rounded-xl mb-4 shadow-sm transition-all ${
          isHistory ? 'bg-gray-50 border-gray-200 opacity-80 hover:opacity-100' : 'bg-white border-blue-200 hover:shadow-md'
        }`}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center space-x-2">
            <span 
              id={`action-title-${action.id}`}
              className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider
              ${action.type === 'PROPOSE_ENTITY' ? 'bg-green-100 text-green-800' : 
                action.type === 'PROPOSE_ENTITY_UPDATE' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
              {action.type.replace(/_/g, ' ')}
            </span>
            {isHistory && (
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider
                ${action.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 
                  action.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' : 'bg-gray-100 text-gray-600'}`}>
                {action.status}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {new Date(action.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </span>
        </div>
        
        <p className="text-sm text-gray-800 mb-4 leading-relaxed">{action.explanation}</p>
        
        {/* Diff / Payload Preview */}
        <div 
          className="bg-gray-900 text-gray-100 p-3 rounded-lg border border-gray-800 mb-5 font-mono text-[11px] max-h-40 overflow-y-auto"
          aria-label="Action Payload Details"
          tabIndex={0}
        >
          <pre>{JSON.stringify(action.payload, null, 2)}</pre>
        </div>

        {!isHistory ? (
          <div className="flex space-x-3">
            <button 
              onClick={() => approveAction(action.id)}
              aria-label={`Approve ${action.type}`}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-colors"
            >
              Approve
            </button>
            <button 
              onClick={() => rejectAction(action.id)}
              aria-label={`Reject ${action.type}`}
              className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg text-sm font-semibold shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 transition-colors"
            >
              Reject
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            {action.status === 'APPROVED' && (
              <button 
                onClick={() => undoAction(action.id)}
                aria-label={`Undo ${action.type}`}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold px-3 py-1.5 rounded hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="p-5 border-b border-gray-200 shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50">
        <h2 className="text-lg font-bold text-indigo-950 flex items-center justify-between">
          <span>Assistant Inbox</span>
          {pendingActions.length > 0 && (
            <span className="bg-blue-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              {pendingActions.length} Pending
            </span>
          )}
        </h2>
        <p className="text-xs text-indigo-800 mt-1.5 font-medium opacity-80">Review AI suggestions for your story bible.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {pendingActions.length === 0 ? (
          <div className="text-center py-12 px-6 flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
            <div className="text-5xl mb-4 grayscale opacity-40">📭</div>
            <p className="text-sm text-gray-600 font-semibold">No pending suggestions.</p>
            <p className="text-xs text-gray-400 mt-2 max-w-[200px] leading-relaxed">As you write your manuscript, the assistant will surface new entities here.</p>
          </div>
        ) : (
          <div className="mb-8" role="feed" aria-label="Pending AI Suggestions">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Needs Review</h3>
            {pendingActions.map(a => renderActionCard(a, false))}
          </div>
        )}

        {pastActions.length > 0 && (
          <div className="mt-8">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 border-t border-gray-100 pt-6">Action History</h3>
            <div role="feed" aria-label="Action History">
              {pastActions.map(a => renderActionCard(a, true))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
