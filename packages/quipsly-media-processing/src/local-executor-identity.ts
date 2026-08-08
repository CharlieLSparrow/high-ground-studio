import { createHash } from "node:crypto";

export function localExecutorHostName(systemHostName: string) {
  return `quipsly-media-worker:${systemHostName}`.slice(0, 220);
}

export function localExecutorNodeId(hostName: string) {
  let hash = 2166136261;
  for (const character of hostName) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `execution_worker_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function localExecutorStorageScopeId(input: {
  hostName: string;
  canonicalRoot: string;
  deviceId: number | bigint;
  inode: number | bigint;
}) {
  return `storage_scope_${createHash("sha256")
    .update(`${input.hostName}\0${input.canonicalRoot}\0${input.deviceId}\0${input.inode}`)
    .digest("hex")
    .slice(0, 40)}`;
}
