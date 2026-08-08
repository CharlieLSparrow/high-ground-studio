import { createHash } from "node:crypto";

import { SOURCE_VISUAL_OVERVIEW_PROFILE } from "./source-visual-overview.js";

const SAFE_ID = /^[A-Za-z0-9:_-]{8,200}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function deterministicId(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`;
}

export function sourceVisualOverviewJobId(identity: string) {
  return deterministicId("svojob", identity);
}

export function sourceVisualOverviewDerivativeId(identity: string) {
  return deterministicId("svoderivative", identity);
}

export function sourceAudioNavigationJobId(identity: string) {
  return deterministicId("sanjob", identity);
}

export function buildSourceVisualOverviewTargetLocator(input: {
  projectSlug: string;
  sourceRevisionId: string;
  inputContentSha256: string;
}) {
  const projectSlug = text(input.projectSlug);
  const sourceRevisionId = text(input.sourceRevisionId);
  const inputContentSha256 = text(input.inputContentSha256).toLowerCase();
  if (
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(projectSlug) ||
    !SAFE_ID.test(sourceRevisionId) ||
    !SHA256.test(inputContentSha256)
  ) {
    throw new Error("Source visual-overview target identity is invalid.");
  }
  return [
    "source-story",
    projectSlug,
    sourceRevisionId,
    `${SOURCE_VISUAL_OVERVIEW_PROFILE}-${inputContentSha256.slice(0, 20)}.jpg`,
  ].join("/");
}
