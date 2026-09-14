"use client";

import { createContext, useContext } from "react";

// Hidden panels keep drafts, but should not poll as though someone is reading
// them. Standalone surfaces remain active without a provider.
export const WorkspacePanelActivity = createContext(true);
export function useWorkspacePanelActive() {
  return useContext(WorkspacePanelActivity);
}
