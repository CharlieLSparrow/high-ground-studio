import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { StoryEntity, AssistantAction, EntityType } from './StoryBibleTypes';

interface StoryBibleState {
  entities: StoryEntity[];
  actions: AssistantAction[];
  activeEntityId: string | null;
  activeView: 'DIRECTORY' | 'DETAIL' | 'INBOX';
  isLoading: boolean;
  error: string | null;
}

interface StoryBibleDispatch {
  setEntities: (entities: StoryEntity[]) => void;
  setActions: (actions: AssistantAction[]) => void;
  addEntity: (entity: StoryEntity) => void;
  updateEntity: (id: string, updates: Partial<StoryEntity>) => void;
  deleteEntity: (id: string) => void;
  setActiveEntity: (id: string | null) => void;
  setActiveView: (view: 'DIRECTORY' | 'DETAIL' | 'INBOX') => void;
  approveAction: (actionId: string) => void;
  rejectAction: (actionId: string) => void;
  undoAction: (actionId: string) => void;
}

const StoryBibleStateContext = createContext<StoryBibleState | undefined>(undefined);
const StoryBibleDispatchContext = createContext<StoryBibleDispatch | undefined>(undefined);

export const StoryBibleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entities, setEntities] = useState<StoryEntity[]>([]);
  const [actions, setActions] = useState<AssistantAction[]>([]);
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'DIRECTORY' | 'DETAIL' | 'INBOX'>('DIRECTORY');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEntity = useCallback((entity: StoryEntity) => {
    setEntities(prev => [...prev, entity]);
  }, []);

  const updateEntity = useCallback((id: string, updates: Partial<StoryEntity>) => {
    setEntities(prev => prev.map(e => (e.id === id ? { ...e, ...updates } : e)));
  }, []);

  const deleteEntity = useCallback((id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id));
    if (activeEntityId === id) {
      setActiveEntityId(null);
      setActiveView('DIRECTORY');
    }
  }, [activeEntityId]);

  const setActiveEntity = useCallback((id: string | null) => {
    setActiveEntityId(id);
    if (id) {
      setActiveView('DETAIL');
    }
  }, []);

  const updateActionStatus = useCallback((actionId: string, status: AssistantAction['status']) => {
    setActions(prev => prev.map(a => (a.id === actionId ? { ...a, status } : a)));
  }, []);

  const approveAction = useCallback((actionId: string) => {
    const action = actions.find(a => a.id === actionId);
    if (!action) return;

    if (action.type === 'PROPOSE_ENTITY' && action.payload) {
      addEntity(action.payload as StoryEntity);
    } else if (action.type === 'PROPOSE_ENTITY_UPDATE' && action.payload?.id) {
      updateEntity(action.payload.id, action.payload.updates);
    }

    updateActionStatus(actionId, 'APPROVED');
  }, [actions, addEntity, updateEntity, updateActionStatus]);

  const rejectAction = useCallback((actionId: string) => {
    updateActionStatus(actionId, 'REJECTED');
  }, [updateActionStatus]);

  const undoAction = useCallback((actionId: string) => {
    const action = actions.find(a => a.id === actionId);
    if (!action) return;
    
    if (action.type === 'PROPOSE_ENTITY' && action.payload?.id) {
       deleteEntity((action.payload as StoryEntity).id);
    }

    updateActionStatus(actionId, 'UNDONE');
  }, [actions, deleteEntity, updateActionStatus]);

  const stateValue = useMemo(() => ({
    entities,
    actions,
    activeEntityId,
    activeView,
    isLoading,
    error
  }), [entities, actions, activeEntityId, activeView, isLoading, error]);

  const dispatchValue = useMemo(() => ({
    setEntities,
    setActions,
    addEntity,
    updateEntity,
    deleteEntity,
    setActiveEntity,
    setActiveView,
    approveAction,
    rejectAction,
    undoAction
  }), [
    addEntity, updateEntity, deleteEntity, setActiveEntity, setActiveView,
    approveAction, rejectAction, undoAction
  ]);

  return (
    <StoryBibleStateContext.Provider value={stateValue}>
      <StoryBibleDispatchContext.Provider value={dispatchValue}>
        {children}
      </StoryBibleDispatchContext.Provider>
    </StoryBibleStateContext.Provider>
  );
};

export const useStoryBibleState = () => {
  const context = useContext(StoryBibleStateContext);
  if (context === undefined) {
    throw new Error('useStoryBibleState must be used within a StoryBibleProvider');
  }
  return context;
};

export const useStoryBibleDispatch = () => {
  const context = useContext(StoryBibleDispatchContext);
  if (context === undefined) {
    throw new Error('useStoryBibleDispatch must be used within a StoryBibleProvider');
  }
  return context;
};

export const useStoryBibleEntitiesByType = (type: EntityType) => {
  const { entities } = useStoryBibleState();
  return useMemo(() => entities.filter(e => e.type === type), [entities, type]);
};
