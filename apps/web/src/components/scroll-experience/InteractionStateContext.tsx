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
  toggleSelection: (panelId: string, userId: string) => void;
  setRating: (panelId: string, userId: string, rating: number) => void;
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

  const addInteraction = useCallback(async (interactionData: Omit<ScrollInteraction, 'id' | 'createdAt'>) => {
    const newInteraction: ScrollInteraction = {
      ...interactionData,
      id: `int_local_${Math.random().toString(36).substring(7)}`,
      createdAt: new Date().toISOString(),
    };
    
    // Optimistic UI update
    if (interactionData.panelId) {
      setLocalInteractions(prev => {
        const existing = prev[interactionData.panelId!] || [];
        return {
          ...prev,
          [interactionData.panelId!]: [...existing, newInteraction],
        };
      });
    }

    // Background persist to database (fails silently if unauthenticated/offline)
    try {
      const { addScrollInteractionAction } = await import('@/app/review/actions');
      await addScrollInteractionAction(
        interactionData.experienceId,
        interactionData.panelId || null,
        interactionData.interactionType,
        interactionData.payload
      );
    } catch (e) {
      console.warn("Could not save interaction to database", e);
    }
  }, []);

  const toggleFavorite = useCallback(async (panelId: string, userId: string) => {
    // Optimistic UI update
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

    // Background persist to database
    try {
      const { toggleFavoriteAction } = await import('@/app/review/actions');
      await toggleFavoriteAction(experienceId, panelId);
    } catch (e) {
      console.warn("Could not save favorite to database", e);
    }
  }, [experienceId]);

  const toggleSelection = useCallback(async (panelId: string, userId: string) => {
    setLocalInteractions(prev => {
      const existing = prev[panelId] || [];
      const isSelected = existing.find(i => i.interactionType === 'SELECTION' && i.userId === userId);
      
      if (isSelected) {
        return { ...prev, [panelId]: existing.filter(i => i.id !== isSelected.id) };
      } else {
        const sel: ScrollInteraction = {
          id: `int_sel_${Date.now()}`,
          experienceId,
          panelId,
          userId,
          interactionType: 'SELECTION',
          payload: { active: true },
          createdAt: new Date().toISOString(),
        };
        return { ...prev, [panelId]: [...existing, sel] };
      }
    });

    try {
      const { toggleSelectionAction } = await import('@/app/review/actions');
      await toggleSelectionAction(experienceId, panelId);
    } catch (e) {
      console.warn("Could not save selection to database", e);
    }
  }, [experienceId]);

  const setRating = useCallback(async (panelId: string, userId: string, rating: number) => {
    setLocalInteractions(prev => {
      const existing = prev[panelId] || [];
      const others = existing.filter(i => !(i.interactionType === 'RATING' && i.userId === userId));
      
      const rate: ScrollInteraction = {
        id: `int_rate_${Date.now()}`,
        experienceId,
        panelId,
        userId,
        interactionType: 'RATING',
        payload: { rating },
        createdAt: new Date().toISOString(),
      };
      return { ...prev, [panelId]: [...others, rate] };
    });

    try {
      const { setRatingAction } = await import('@/app/review/actions');
      await setRatingAction(experienceId, panelId, rating);
    } catch (e) {
      console.warn("Could not save rating to database", e);
    }
  }, [experienceId]);

  const value = useMemo(() => ({
    viewerState,
    activePanelId,
    activeGroupId,
    localInteractions,
    setActivePanel,
    addInteraction,
    toggleFavorite,
    toggleSelection,
    setRating,
  }), [viewerState, activePanelId, activeGroupId, localInteractions, setActivePanel, addInteraction, toggleFavorite, toggleSelection, setRating]);

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
