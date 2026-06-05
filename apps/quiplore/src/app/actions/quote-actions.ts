"use server";

import { QuipslyApiAdapter } from "@/lib/quipsly-api-adapter";
import { getAllQuipCards, getQuotePassportBySlug } from "@high-ground/quipsly-domain/seed";
import type { QuipCardProjection, QuotePassportProjection } from "@high-ground/quipsly-domain";

export async function fetchAllQuotesMock(): Promise<readonly QuipCardProjection[]> {
  try {
    return await QuipslyApiAdapter.getPublicStream("verified") as any;
  } catch (error) {
    return getAllQuipCards();
  }
}

export async function fetchQuotePassportMock(slug: string): Promise<QuotePassportProjection | undefined> {
  try {
    const passport = await QuipslyApiAdapter.getPublicPassport(slug);
    if (passport) return passport;
    return getQuotePassportBySlug(slug);
  } catch (error) {
    return getQuotePassportBySlug(slug);
  }
}
