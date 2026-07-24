import { failRetiredPublishingExecution } from "@/lib/server/retired-publishing-execution";

/**
 * Retired until replies have a tenant-scoped provider account, an explicit
 * actor, an idempotency key, and a persisted provider response receipt. The
 * previous implementation pretended to call a provider and then marked the local
 * interaction replied.
 */
export class InboxManager {
  async replyToInteraction(interactionId: string, replyText: string) {
    void interactionId;
    void replyText;
    return failRetiredPublishingExecution();
  }
}
