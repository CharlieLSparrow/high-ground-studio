export type SessionOutputJournalEntry<T extends Record<string, unknown>> = {
  key: string;
  clientRequestId: string;
  body: T;
};

/**
 * Retains one exact browser mutation request until the server acknowledges it.
 * A lost response can therefore retry the same UUID and timestamped evidence
 * instead of appending a second receipt. Canonical server state remains the
 * recovery source after a full page reload.
 */
export class SessionOutputRequestJournal {
  private readonly entries = new Map<string, SessionOutputJournalEntry<Record<string, unknown>>>();

  constructor(private readonly createId: () => string = () => globalThis.crypto.randomUUID()) {}

  preserve<T extends Record<string, unknown>>(
    key: string,
    createBody: () => T,
  ): SessionOutputJournalEntry<T> {
    const existing = this.entries.get(key);
    if (existing) return existing as SessionOutputJournalEntry<T>;
    const entry: SessionOutputJournalEntry<T> = {
      key,
      clientRequestId: this.createId(),
      body: createBody(),
    };
    this.entries.set(key, entry);
    return entry;
  }

  acknowledge(key: string) {
    this.entries.delete(key);
  }
}
