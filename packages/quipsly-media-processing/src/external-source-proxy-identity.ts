import { createHash } from "node:crypto";

import { EXTERNAL_SOURCE_PROXY_PROFILE } from "./external-source-proxy.js";

const SAFE_ID = /^[A-Za-z0-9:_-]{8,200}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function externalSourceProxyIdentity(input: {
  projectId: string;
  sourceRevisionId: string;
  identitySha256: string;
  custodianNodeId?: string;
  storageScopeId?: string;
  profile?: string;
}) {
  const custodianNodeId = text(input.custodianNodeId);
  const storageScopeId = text(input.storageScopeId);
  if (
    Boolean(custodianNodeId) !== Boolean(storageScopeId) ||
    (custodianNodeId &&
      (!SAFE_ID.test(custodianNodeId) || !SAFE_ID.test(storageScopeId)))
  ) {
    throw new Error("External source proxy custody identity is invalid.");
  }
  return [
    custodianNodeId ? "external-source-proxy-v2" : "external-source-proxy-v1",
    text(input.projectId),
    text(input.sourceRevisionId),
    text(input.identitySha256).toLowerCase(),
    ...(custodianNodeId ? [custodianNodeId, storageScopeId] : []),
    text(input.profile) || EXTERNAL_SOURCE_PROXY_PROFILE,
  ].join(":");
}

function deterministicExternalSourceProxyId(prefix: string, identity: string) {
  return `${prefix}_${createHash("sha256").update(identity).digest("hex").slice(0, 48)}`;
}

export function externalSourceProxyJobId(identity: string) {
  return deterministicExternalSourceProxyId("xspjob", identity);
}

export function externalSourceProxyDerivativeId(identity: string) {
  return deterministicExternalSourceProxyId("xspderivative", identity);
}

export function buildExternalSourceProxyTargetLocator(input: {
  projectSlug: string;
  sourceRevisionId: string;
  identitySha256: string;
}) {
  const projectSlug = text(input.projectSlug);
  const sourceRevisionId = text(input.sourceRevisionId);
  const identitySha256 = text(input.identitySha256).toLowerCase();
  if (
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(projectSlug) ||
    !SAFE_ID.test(sourceRevisionId) ||
    !SHA256.test(identitySha256)
  ) {
    throw new Error("External source proxy target identity is invalid.");
  }
  return [
    "source-story",
    projectSlug,
    sourceRevisionId,
    `${EXTERNAL_SOURCE_PROXY_PROFILE}-${identitySha256.slice(0, 20)}.mp4`,
  ].join("/");
}
