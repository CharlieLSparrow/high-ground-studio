'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ViewerState, ScrollInteraction } from './types';

interface InteractionContextValue {
  viewerState: ViewerState;
  activePanelId: string | null;
  activeGroupId: string | null;
  localInteractions: Record<string, ScrollInteraction[]>;
  setActivePanel: (groupId: string, panelId: string) => void;
  addInteraction: (interaction: Omit<ScrollInteraction, 'id' | 'createdAt'>) => void;
  toggleFavorite: (panelId: string, userId: string) => void;
}

const InteractionStateContext = createContext<InteractionContextValue | null>(null);

export function InteractionStateProvider({ children, experienceId }: { children: React.ReactNode, experienceId: string }) {
  const [viewerState, setViewerState] = useState<ViewerState>({
    currentExperienceId: experienceId,
    currentGroupId: '',
    currentPanelId: '',
    viewDurationMs: 0,
    completedPanelIds: [],
    selectedPanelIds: [],
  });

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  
  // Local volatile store for optimistic interaction updates
  const [localInteractions, setLocalInteractions] = useState<Record<string, ScrollInteraction[]>>({});

  const setActivePanel = useCallback((groupId: string, panelId: string) => {
    setActiveGroupId(groupId);
    setActivePanelId(panelId);
    setViewerState(prev => ({
      ...prev,
      currentGroupId: groupId,
      currentPanelId: panelId,
    }));
  }, []);

  const addInteraction = useCallback((interactionData: Omit<ScrollInteraction, 'id' | 'createdAt'>) => {
    const newInteraction: ScrollInteraction = {
      ...interactionData,
      id: `int_local_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    };
    
    if (interactionData.panelId) {
      setLocalInteractions(prev => {
        const existing = prev[interactionData.panelId!] || [];
        return {
          ...prev,
          [interactionData.panelId!]: [...existing, newInteraction],
        };
      });
    }
  }, []);

  const toggleFavorite = useCallback((panelId: string, userId: string) => {
    setLocalInteractions(prev => {
      const existing = prev[panelId] || [];
      const isFav = existing.find(i => i.interactionType === 'FAVORITE' && i.userId === userId);
      
      if (isFav) {
        return { ...prev, [panelId]: existing.filter(i => i.id !== isFav.id) };
      } else {
        const fav: ScrollInteraction = {
          id: `int_fav_${Date.now()}`,
          experienceId,
          panelId,
          userId,
          interactionType: 'FAVORITE',
          payload: { active: true },
          createdAt: new Date().toISOString(),
        };
        return { ...prev, [panelId]: [...existing, fav] };
      }
    });
  }, [experienceId]);

  const value = useMemo(() => ({
    viewerState,
    activePanelId,
    activeGroupId,
    localInteractions,
    setActivePanel,
    addInteraction,
    toggleFavorite,
  }), [viewerState, activePanelId, activeGroupId, localInteractions, setActivePanel, addInteraction, toggleFavorite]);

  return (
    <InteractionStateContext.Provider value={value}>
      {children}
    </InteractionStateContext.Provider>
  );
}

export function useInteractionState() {
  const context = useContext(InteractionStateContext);
  if (!context) {
    throw new Error('useInteractionState must be used within an InteractionStateProvider');
  }
  return context;
}
