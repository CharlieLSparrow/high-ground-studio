"use server";

import { QuipslyApiAdapter } from "@/lib/quipsly-api-adapter";
import { getQuipStreamCards, starterNest } from "@high-ground/quipsly-domain/seed";
import type { StreamMode, QuipStreamCardProjection } from "@high-ground/quipsly-domain";

// Mock API: Fetch stream cards
export async function fetchQuipStream(mode: StreamMode = "for-you"): Promise<readonly QuipStreamCardProjection[]> {
  try {
    return await QuipslyApiAdapter.getPublicStream(mode);
  } catch (error) {
    return getQuipStreamCards(mode);
  }
}

// Mock API: Save quote to nest
export async function saveToNest(quoteId: string): Promise<boolean> {
  await new Promise(resolve => setTimeout(resolve, 150));
  // In a real app, this would POST to /api/nests
  return true;
}

// Mock API: Add to Lorelist
export async function addToLorelist(quoteId: string): Promise<boolean> {
  await new Promise(resolve => setTimeout(resolve, 150));
  // In a real app, this would POST to /api/lorelists
  return true;
}

// Mock API: Fetch lorelists for home page
export async function getLorelistsHomeData(): Promise<any[]> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return [];
}

// Telemetry API: Send engagement events to Quipsly
export async function logStreamEvent(sessionId: string, event: { type: string, quoteId?: string, mode?: string, dwellMs?: number, metadata?: any }): Promise<void> {
  // Fire and forget via the adapter
  QuipslyApiAdapter.logStreamEvents(sessionId, [event]).catch(() => {
    // Ignore logging errors silently so the UI never breaks
  });
}
