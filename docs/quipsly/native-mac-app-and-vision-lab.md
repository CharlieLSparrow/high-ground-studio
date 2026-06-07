# Quipsly Native Mac App and Vision Lab

## Decision

Quipsly should have a real native Mac app for local-heavy work.

The browser/Nest app remains the collaborative workspace: accounts, access,
projects/nests, manuscript state, publishing, review, and shared memory.

The Mac app becomes the local power tool: file access, media ingest, proxies,
safe offload, local render prep, local ML jobs, and research workflows that
should be opt-in per account or workspace.

## Why native Mac matters

- Video editing and proxy workflows need strong local file access.
- Research photo workflows often involve large folders and external drives.
- Local ML training should not depend on browser sandbox behavior.
- Users need calm confidence around what is local, uploaded, verified, and safe.
- Sensitive research data should not leave the machine by accident.

## Current implementation

- `apps/local-engine` remains the shared local service on `ws://localhost:4000`.
- `apps/desktop-companion` remains the existing Electron client.
- `apps/quipsly-mac` is the new SwiftUI native shell.
- The local engine now broadcasts `ENGINE_CAPABILITIES`.
- The local engine now broadcasts `VISION_LAB_STATUS`.

## Feature flags and entitlements

The local engine exposes capability booleans:

- `mediaEditing`
- `localIngest`
- `cloudSync`
- `safeOffload`
- `aiLogging`
- `visionLab`
- `mlTraining`
- `marineBiologyWorkflow`

The app can show or hide modules based on those capabilities. Cloud-side account
entitlements should eventually decide which modules are available, but the local
engine must still be able to disable hardware or experimental features.

## Vision Lab first workflow

The marine biology use case should start with a safe local dashboard:

1. Choose a local photo folder.
2. Create a dataset manifest before moving or renaming files.
3. Review labels such as species, individual, location, date, confidence, and notes.
4. Split into train/validation/test sets only after the manifest is inspectable.
5. Run local training only when the user explicitly enables the capability.
6. Review predictions before publishing findings back into Nest.

## Guardrail

Do not turn Vision Lab into a separate product with a separate data model too
early. It is a Quipsly local module that feeds the same Nest/project/asset spine.

## Manifest safety rules

The first manifest pass is intentionally conservative:

- It recursively scans the selected local folder.
- It groups files by image, video, metadata, and other.
- It records extension counts and byte totals.
- It computes quick fingerprints from relative path, file size, and modified
  time.
- It saves a JSON manifest under local Application Support so the dataset can be
  reviewed later without rescanning immediately.
- It lists recent saved manifests back into the Mac dashboard after restart.
- It can compute full SHA-256 content hashes only when the user explicitly asks,
  because hashing massive research folders can be slow.
- It does not move, rename, upload, train on, or delete anything.
