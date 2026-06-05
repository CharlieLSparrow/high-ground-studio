import { PatreonPostCreateRequest, PatreonPostCreateResponse } from "./types";

export class PatreonApiClient {
  private accessToken: string;

  constructor() {
    const token = process.env.PATREON_CREATOR_ACCESS_TOKEN;
    if (!token) {
      throw new Error("PATREON_CREATOR_ACCESS_TOKEN is not defined in environment.");
    }
    this.accessToken = token;
  }

  private async fetchPatreon(path: string, options: RequestInit = {}): Promise<any> {
    const url = `https://www.patreon.com/api/oauth2/v2${path}`;
    const headers = {
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Patreon API Error] ${response.status} ${response.statusText}`, errText);
      throw new Error(`Patreon API failed: ${response.statusText} - ${errText}`);
    }

    return response.json();
  }

  /**
   * Fetches the first campaign ID associated with the authenticated creator.
   */
  public async getCurrentCampaignId(): Promise<string> {
    const data = await this.fetchPatreon("/campaigns");
    if (!data || !data.data || data.data.length === 0) {
      throw new Error("No Patreon campaigns found for this creator token.");
    }
    return data.data[0].id;
  }

  /**
   * Creates a post on the given campaign.
   */
  public async createPost(campaignId: string, request: PatreonPostCreateRequest): Promise<PatreonPostCreateResponse> {
    // If the endpoint isn't supported in v2 standard paths, this will throw a detailed error.
    // For many integrations, this hits the v2 JSON:API endpoint.
    return this.fetchPatreon(`/campaigns/${campaignId}/posts`, {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
}
