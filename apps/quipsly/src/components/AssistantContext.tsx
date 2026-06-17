"use client";

import React, { createContext, useContext } from "react";
import { AssistantAction, AssistantActionStatus, AssistantPreviewCard } from "./assistant-types";

export interface AssistantContextValue {
  actions: AssistantAction[];
  approveAction: (action: AssistantAction) => Promise<void>;
  rejectAction: (action: AssistantAction) => void;
  undoAction: (action: AssistantAction) => void;
  saveAction: (action: AssistantAction) => Promise<void>;
  undoSaveAction: (action: AssistantAction) => Promise<void>;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({
  value,
  children,
}: {
  value: AssistantContextValue;
  children: React.ReactNode;
}) {
  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) {
    // If not wrapped in provider (e.g., in some isolated views), provide a safe fallback or throw.
    // For now we'll return a stub to avoid breaking anything not wrapped yet.
    return {
      actions: [],
      approveAction: async () => {},
      rejectAction: () => {},
      undoAction: () => {},
      saveAction: async () => {},
      undoSaveAction: async () => {},
    };
  }
  return context;
}
