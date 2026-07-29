# Platform and Local Compute Policy

Status: active product and engineering policy

This policy keeps Quipsly's toolchain choices intentional. It is a default, not dogma: change it when a real product requirement outweighs it, but record that decision instead of accumulating accidental compatibility layers.

## TypeScript

- New TypeScript work uses the current stable TypeScript 7 toolchain.
- Active TypeScript packages must be migrated from TypeScript 5/6 to TypeScript 7 package by package. This is a required modernization path, not an indefinite compatibility backlog.
- Treat the move as a compiler and tooling migration. Audit `tsconfig` options, build plugins, generated code, lint integrations, and compiler-API consumers before refactoring application behavior.
- Remove obsolete or removed compiler options rather than hiding them behind fallback configs.
- Do not add a TypeScript 5/6 fallback unless a named dependency has a proven incompatibility. Any exception must document its owner, blocker, affected package, and removal trigger.
- Keep each migration coherent and reviewable: upgrade one dependency boundary, restore typecheck/build/test confidence, then continue. Do not combine an unbounded mechanical rewrite with unrelated product behavior changes.
- As of 2026-07-23, all tracked TypeScript projects run the pinned TypeScript
  7.0.2 compiler. TypeScript 6 remains only as the documented programmatic API
  bridge for Next.js, `ts-node`, and other embedded tooling that cannot yet use
  TypeScript 7's future API.

## Native Apple Apps

- First-party Quipsly macOS and iOS apps target the latest major Apple OS and SDK available to the project. As of this policy, that means macOS 26.x and iOS 26.x.
- Prefer current native Swift, SwiftUI, AppKit/UIKit, AVFoundation, and platform APIs. Fix deprecations instead of adding compatibility shims for older OS releases.
- Do not preserve older deployment targets without a concrete supported-device or customer requirement.
- Centralize deployment targets in the source configuration (`project.yml`, `Package.swift`, or the authoritative project generator). Regenerate derived Xcode projects rather than letting generated project files become a second source of truth.
- Existing older targets, including remaining iOS 17 settings in HighGroundCapture, are migration work to audit and remove deliberately.
- Latest-only does not excuse untested adoption. Build and exercise the real native app path after SDK or deployment-target changes.

## Local Audio AI and Compute

- Local audio enhancement, restoration, separation, transcription, and analysis models may use the M4 MacBook Pro and its 48 GB of unified memory aggressively when they can improve production quality or make audio decisions more transparent.
- Models are assistants inside a staged audio workbench, not an opaque replacement for source-aware editing. Preserve the raw aligned source, render each model stage separately, and keep Charlie, Homer, and reference/clip stems distinct and equal length.
- Never mutate original recordings. Model outputs belong in managed caches or versioned Media Vault stages, not beside or over the source files.
- Record model name, exact version or checksum, settings, input provenance, output path, runtime, warnings, and objective measurements. Make useful stages directly A/B-listenable in Quipsly Studio.
- Evaluate models on representative Episode 4 passages before running an entire episode. Compare intelligibility, tone, noise/echo suppression, artifacts, loudness, dynamics, and speaker balance.
- Large model weights and generated media do not belong in Git. Keep reproducible manifests and scripts in the repo; keep weights, caches, and renders in managed local/external storage.
- Codex may use available compute heavily and may gracefully close nonessential applications when necessary for an approved model/media workload. Do not terminate applications that may contain unsaved user work.

## Decision Rule

Choose the architecture we expect to want several iterations from now when its cost is reasonable today. Revisit this policy when platform reach, customer hardware, App Store requirements, dependency compatibility, or measured model quality changes. The purpose is to prevent accidental technical debt, not to create a new paperwork gate.
