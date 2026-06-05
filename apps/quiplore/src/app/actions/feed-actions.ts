"use server";

import { getQuipStreamCards, starterNest } from "@high-ground/quipsly-domain/seed";
import type { StreamMode, QuipStreamCardProjection } from "@high-ground/quipsly-domain";

// Mock API: Fetch stream cards
export async function fetchQuipStream(mode: StreamMode = "for-you"): Promise<readonly QuipStreamCardProjection[]> {
  // Simulate network delay for API realism
  await new Promise(resolve => setTimeout(resolve, 300));
  return getQuipStreamCards(mode);
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
