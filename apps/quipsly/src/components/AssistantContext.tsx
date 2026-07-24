"use client";

import React, { createContext, useContext } from "react";
import { AssistantAction, AssistantActionStatus, AssistantPreviewCard } from "./assistant-types";

export interface AssistantContextValue {
  actions: AssistantAction[];
  approveAction: (action: AssistantAction) => Promise<void>;
  rejectAction: (action: AssistantAction) => Promise<void>;
  undoAction: (action: AssistantAction) => Promise<void>;
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
    throw new Error("useAssistant must be rendered inside AssistantProvider; silent review actions are not allowed.");
  }
  return context;
}
