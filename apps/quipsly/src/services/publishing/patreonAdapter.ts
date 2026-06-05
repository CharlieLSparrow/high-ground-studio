import { PatreonPostCreateRequest, PatreonPostCreateResponse } from "@/lib/patreon/types";

export interface GenericPublishingPackage {
  title: string;
  contentBody: string; 
  mediaAttachments: string[]; 
  visibilityType: "PUBLIC" | "GATED";
  audienceSegmentIds?: string[];
  scheduledPublishAt?: Date;
  integrationMetadata?: Record<string, any>;
}

export interface PatreonOAuthConfig {
  accessToken: string;
  campaignId: string;
}

export class PatreonPublisherAdapter {
  private config: PatreonOAuthConfig;
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_BACKOFF_MS = 1000;

  constructor(config: PatreonOAuthConfig) {
    this.config = config;
  }

  async publish(payload: GenericPublishingPackage): Promise<string> {
    const patreonPayload = this.translatePayload(payload);
    
    // SaaS Hardening: Exponential Backoff Retry Loop
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`https://www.patreon.com/api/oauth2/v2/campaigns/${this.config.campaignId}/posts`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patreonPayload),
        });

        if (!response.ok) {
          // If Rate Limited (429) or Server Error (5xx), throw to trigger retry
          if (response.status === 429 || response.status >= 500) {
            throw new Error(`Transient API Error: ${response.status}`);
          }
          
          // Client errors (4xx other than 429) shouldn't be retried
          const errorText = await response.text();
          throw new Error(`Fatal Patreon API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as PatreonPostCreateResponse;
        return data.data.attributes.url;

      } catch (err: any) {
        if (err.message.includes("Fatal") || attempt === this.MAX_RETRIES) {
          throw err;
        }

        const backoff = this.INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`[Patreon Publisher] Attempt ${attempt + 1} failed. Retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
    
    throw new Error("Patreon publish failed completely."); // Should be unreachable
  }

  private translatePayload(payload: GenericPublishingPackage): PatreonPostCreateRequest {
    const isPublic = payload.visibilityType === "PUBLIC";
    
    let tierMappings: Array<{id: string, type: "tier"}> = [];
    if (!isPublic && payload.audienceSegmentIds) {
      tierMappings = payload.audienceSegmentIds.map(id => ({ id, type: "tier" }));
    }

    const request: PatreonPostCreateRequest = {
      data: {
        type: "post",
        attributes: {
          title: payload.title,
          content: payload.contentBody,
          is_public: isPublic,
          scheduled_for: payload.scheduledPublishAt?.toISOString(),
        },
        relationships: {
          campaign: {
            data: { id: this.config.campaignId, type: "campaign" }
          }
        }
      }
    };

    if (!isPublic && tierMappings.length > 0 && request.data.relationships) {
      request.data.relationships.tiers = { data: tierMappings };
    }

    return request;
  }
}
