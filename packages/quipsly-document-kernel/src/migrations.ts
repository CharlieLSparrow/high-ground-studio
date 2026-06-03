import {
  QUIPSLY_DOCUMENT_SCHEMA_VERSION,
  type QuipslyDocument,
} from "./document";

export type MigrationResult = {
  document: QuipslyDocument;
  migrated: boolean;
  warnings: string[];
};

export function migrateQuipslyDocument(input: unknown): MigrationResult {
  const warnings: string[] = [];

  if (!input || typeof input !== "object") {
    throw new Error("Quipsly document migration input must be an object.");
  }

  const document = input as QuipslyDocument;

  if (document.schemaVersion !== QUIPSLY_DOCUMENT_SCHEMA_VERSION) {
    warnings.push(
      `Unknown schema version ${String(document.schemaVersion)}; assuming current shape.`,
    );
    document.schemaVersion = QUIPSLY_DOCUMENT_SCHEMA_VERSION;
  }

  document.nodes ??= [];
  document.boundaries ??= [];
  document.regions ??= [];
  document.annotations ??= [];
  document.entityReferences ??= [];

  return {
    document,
    migrated: warnings.length > 0,
    warnings,
  };
}
