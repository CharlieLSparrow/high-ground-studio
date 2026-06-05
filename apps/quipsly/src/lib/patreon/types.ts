import { z } from 'zod';

// -----------------------------------------------------------------------------
// PATREON API V2 SDK TYPES
// -----------------------------------------------------------------------------

/**
 * Core Webhook Event Types supported by Quipsly's integration
 */
export enum PatreonWebhookEventType {
  MEMBERS_CREATE = 'members:create',
  MEMBERS_UPDATE = 'members:update',
  MEMBERS_DELETE = 'members:delete',
  MEMBERS_PLEDGE_CREATE = 'members:pledge:create',
  MEMBERS_PLEDGE_UPDATE = 'members:pledge:update',
  MEMBERS_PLEDGE_DELETE = 'members:pledge:delete',
}

/**
 * Standard Patreon JSON:API Resource Identifier
 */
export const PatreonResourceIdentifierSchema = z.object({
  id: z.string(),
  type: z.string(),
});
export type PatreonResourceIdentifier = z.infer<typeof PatreonResourceIdentifierSchema>;

/**
 * Patreon Member Attributes
 */
export const PatreonMemberAttributesSchema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  is_follower: z.boolean().optional(),
  last_charge_date: z.string().nullable().optional(),
  last_charge_status: z.enum(['Paid', 'Declined', 'Deleted', 'Pending', 'Refunded', 'Fraud', 'Other']).nullable().optional(),
  lifetime_support_cents: z.number().int().optional(),
  next_charge_date: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  patron_status: z.enum(['active_patron', 'declined_patron', 'former_patron']).nullable(),
  pledge_cadence: z.number().int().optional(),
  pledge_relationship_start: z.string().nullable().optional(),
  will_pay_amount_cents: z.number().int().optional(),
});
export type PatreonMemberAttributes = z.infer<typeof PatreonMemberAttributesSchema>;

/**
 * Included Related Data (e.g. Tiers, Users, Campaigns)
 */
export const PatreonIncludedResourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()),
});

/**
 * The standard Patreon Webhook Payload for Member events
 */
export const PatreonMemberWebhookPayloadSchema = z.object({
  data: z.object({
    id: z.string(),
    type: z.literal('member'),
    attributes: PatreonMemberAttributesSchema,
    relationships: z.object({
      currently_entitled_tiers: z.object({
        data: z.array(PatreonResourceIdentifierSchema),
      }).optional(),
      user: z.object({
        data: PatreonResourceIdentifierSchema,
      }).optional(),
      campaign: z.object({
        data: PatreonResourceIdentifierSchema,
      }).optional(),
    }).optional(),
  }),
  included: z.array(PatreonIncludedResourceSchema).optional(),
});
export type PatreonMemberWebhookPayload = z.infer<typeof PatreonMemberWebhookPayloadSchema>;

// -----------------------------------------------------------------------------
// PATREON OUTBOUND PUBLISHING TYPES
// -----------------------------------------------------------------------------

export enum PatreonPostTeaserStatus {
  TEASER_ONLY = 'teaser_only',
  FULL_POST = 'full_post',
}

/**
 * Standard Quipsly to Patreon Mapping for creating a post
 */
export interface PatreonPostCreateRequest {
  data: {
    type: 'post';
    attributes: {
      title: string;
      content: string; // HTML allowed
      is_public: boolean;
      teaser_text?: string;
      scheduled_for?: string; // ISO8601
      tags?: string[];
    };
    relationships?: {
      campaign: {
        data: {
          id: string;
          type: 'campaign';
        };
      };
      tiers?: {
        data: Array<{ id: string; type: 'tier' }>;
      };
    };
  };
}

/**
 * API Response for Post Creation
 */
export interface PatreonPostCreateResponse {
  data: {
    id: string;
    type: 'post';
    attributes: {
      url: string;
      published_at: string;
    };
  };
}

/**
 * Validation Helper
 */
export function validatePatreonWebhook(body: unknown): PatreonMemberWebhookPayload {
  return PatreonMemberWebhookPayloadSchema.parse(body);
}
