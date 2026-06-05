import React, { Component, ErrorInfo, useEffect, useState } from 'react';
import { useStoryBibleState, useStoryBibleDispatch } from './StoryBibleProvider';
import { EntityDirectory } from './EntityDirectory';
import { EntityDetailCard } from './EntityDetailCard';
import { AssistantInbox } from './AssistantInbox';
import { MOCK_ENTITIES, MOCK_ACTIONS } from './MockData';

// -----------------------------------------------------------------------------
// Error Boundary
// -----------------------------------------------------------------------------
class StoryBibleErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Story Bible Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <aside className="w-80 h-screen bg-white border-l border-gray-200 flex flex-col shadow-xl z-10 absolute right-0 top-0 p-6 items-center justify-center text-center">
          <div className="text-red-500 mb-4">
             <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-6">The Story Bible encountered an unexpected error.</p>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </aside>
      );
    }
    return this.props.children;
  }
}

// -----------------------------------------------------------------------------
// Loading Skeleton
// -----------------------------------------------------------------------------
const StoryBibleSkeleton = () => (
  <div className="flex flex-col h-full bg-white animate-pulse" aria-busy="true" aria-label="Loading Story Bible">
    <div className="flex bg-gray-100 p-1 rounded-lg mx-3 mt-4 mb-2 h-9"></div>
    <div className="p-4 border-b border-gray-100">
      <div className="h-5 bg-gray-200 rounded w-1/3 mb-4"></div>
      <div className="h-8 bg-gray-100 rounded w-full"></div>
    </div>
    <div className="p-4 space-y-4">
       {[...Array(5)].map((_, i) => (
         <div key={i} className="flex justify-between items-center">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-3 bg-gray-100 rounded w-8"></div>
         </div>
       ))}
    </div>
  </div>
);

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
const StoryBibleSidebarContent: React.FC = React.memo(() => {
  const { activeView, actions, entities } = useStoryBibleState();
  const { setActiveView, setEntities, setActions } = useStoryBibleDispatch();
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // Simulate network load
  useEffect(() => {
    if (entities.length === 0) {
      const timer = setTimeout(() => {
        setEntities(MOCK_ENTITIES);
        setActions(MOCK_ACTIONS);
        setIsBootstrapping(false);
      }, 800); // 800ms artificial delay for skeleton
      return () => clearTimeout(timer);
    } else {
       setIsBootstrapping(false);
    }
  }, [entities.length, setEntities, setActions]);

  const pendingCount = actions.filter(a => a.status === 'PENDING').length;

  if (isBootstrapping) {
    return (
      <aside className="w-80 h-screen bg-white border-l border-gray-200 flex flex-col shadow-xl z-10 absolute right-0 top-0">
         <StoryBibleSkeleton />
      </aside>
    );
  }

  return (
    <aside className="w-80 h-screen bg-white border-l border-gray-200 flex flex-col shadow-xl z-10 absolute right-0 top-0" aria-label="Story Bible Sidebar">
      {/* Top Navigation Tabs */}
      <div className="flex bg-gray-100 p-1.5 rounded-lg mx-3 mt-4 mb-2 shrink-0" role="tablist">
        <button
          role="tab"
          aria-selected={activeView === 'DIRECTORY' || activeView === 'DETAIL'}
          aria-controls="panel-story-bible"
          id="tab-story-bible"
          onClick={() => setActiveView(activeView === 'DETAIL' ? 'DETAIL' : 'DIRECTORY')}
          className={`flex-1 py-1.5 px-2 text-sm font-semibold rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            activeView === 'DIRECTORY' || activeView === 'DETAIL'
              ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
          }`}
        >
          Story Bible
        </button>
        <button
          role="tab"
          aria-selected={activeView === 'INBOX'}
          aria-controls="panel-inbox"
          id="tab-inbox"
          onClick={() => setActiveView('INBOX')}
          className={`flex-1 py-1.5 px-2 text-sm font-semibold rounded-md transition-all relative flex justify-center items-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            activeView === 'INBOX'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
          }`}
        >
          Inbox
          {pendingCount > 0 && (
            <span className="absolute right-2 top-2 flex h-2 w-2" aria-label={`${pendingCount} pending items`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
            </span>
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <div 
          role="tabpanel"
          id="panel-story-bible"
          aria-labelledby="tab-story-bible"
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeView === 'DIRECTORY' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          {activeView === 'DIRECTORY' && <EntityDirectory />}
        </div>
        
        <div 
          className={`absolute inset-0 transition-transform duration-300 transform bg-white shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.1)] ${
            activeView === 'DETAIL' ? 'translate-x-0 z-20 pointer-events-auto' : 'translate-x-full z-0 pointer-events-none'
          }`}
        >
          {activeView === 'DETAIL' && <EntityDetailCard />}
        </div>

        <div 
          role="tabpanel"
          id="panel-inbox"
          aria-labelledby="tab-inbox"
          className={`absolute inset-0 transition-opacity duration-200 ${
            activeView === 'INBOX' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          {activeView === 'INBOX' && <AssistantInbox />}
        </div>
      </div>
    </aside>
  );
});

export const StoryBibleSidebar = () => (
  <StoryBibleErrorBoundary>
    <StoryBibleSidebarContent />
  </StoryBibleErrorBoundary>
);
