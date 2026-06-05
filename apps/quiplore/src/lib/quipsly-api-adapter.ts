/**
 * Quipsly Public API Adapter
 * 
 * Defines the contract boundary between the QuipLore consumer frontend
 * and the Quipsly curation backend.
 * 
 * IMPORTANT: This adapter ONLY fetches from `/api/public/*` routes.
 * It must never attempt to read private manuscript or nest endpoints.
 */

import { QuipStreamCardProjection, QuotePassportProjection } from "@high-ground/quipsly-domain";

const QUIPSLY_API_BASE = process.env.QUIPSLY_API_URL || "http://localhost:3000";

export const QuipslyApiAdapter = {
  /**
   * Fetches the public QuipStream feed for consumer consumption.
   */
  async getPublicStream(mode: string = "for-you"): Promise<readonly QuipStreamCardProjection[]> {
    try {
      const res = await fetch(`${QUIPSLY_API_BASE}/api/public/stream?mode=${mode}`, {
        next: { revalidate: 60 } // Cache stream for 60 seconds
      });
      if (!res.ok) throw new Error("Failed to fetch stream");
      const json = await res.json();
      return json.data;
    } catch (e) {
      console.warn("Quipsly API unreachable, falling back to local domain seed.", e);
      // Fallback is handled directly by the frontend action if this throws, 
      // ensuring QuipLore always stays up even if Quipsly is down.
      throw e;
    }
  },

  /**
   * Fetches the detailed Quote Passport (provenance, verification, variants).
   */
  async getPublicPassport(slug: string): Promise<QuotePassportProjection | undefined> {
    try {
      const res = await fetch(`${QUIPSLY_API_BASE}/api/public/passports/${slug}`, {
        next: { revalidate: 3600 } // Cache passports for 1 hour
      });
      if (!res.ok) {
        if (res.status === 404) return undefined;
        throw new Error("Failed to fetch passport");
      }
      const json = await res.json();
      return json.data;
    } catch (e) {
      console.warn(`Quipsly API unreachable for passport ${slug}`, e);
      throw e;
    }
  },

  /**
   * Pushes batched telemetry events back to Quipsly's research ledger.
   */
  async logStreamEvents(sessionId: string, events: any[]): Promise<void> {
    try {
      await fetch(`${QUIPSLY_API_BASE}/api/public/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, events })
      });
    } catch (e) {
      // Telemetry should be fire-and-forget and never crash the consumer app
      console.warn("Failed to push telemetry to Quipsly.", e);
    }
  }
};
