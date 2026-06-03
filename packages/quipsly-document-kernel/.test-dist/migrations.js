"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateQuipslyDocument = migrateQuipslyDocument;
const document_1 = require("./document");
function migrateQuipslyDocument(input) {
    const warnings = [];
    if (!input || typeof input !== "object") {
        throw new Error("Quipsly document migration input must be an object.");
    }
    const document = input;
    if (document.schemaVersion !== document_1.QUIPSLY_DOCUMENT_SCHEMA_VERSION) {
        warnings.push(`Unknown schema version ${String(document.schemaVersion)}; assuming current shape.`);
        document.schemaVersion = document_1.QUIPSLY_DOCUMENT_SCHEMA_VERSION;
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
