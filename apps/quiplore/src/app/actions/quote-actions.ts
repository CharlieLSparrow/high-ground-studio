"use server";

import { getAllQuipCards, getQuotePassportBySlug } from "@high-ground/quipsly-domain/seed";
import type { QuipCardProjection, QuotePassportProjection } from "@high-ground/quipsly-domain";

export async function fetchAllQuotesMock(): Promise<readonly QuipCardProjection[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  return getAllQuipCards();
}

export async function fetchQuotePassportMock(slug: string): Promise<QuotePassportProjection | undefined> {
  await new Promise(resolve => setTimeout(resolve, 300));
  return getQuotePassportBySlug(slug);
}
