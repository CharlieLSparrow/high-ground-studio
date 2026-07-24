#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 2) {
      values.set(token.slice(2, equalsIndex), token.slice(equalsIndex + 1));
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags.add(key);
    else {
      values.set(key, next);
      index += 1;
    }
  }
  return { values, flags };
}

function deterministicId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function findActiveSequence(value, activeSequenceId) {
  let fallback = null;
  const seen = new Set();

  function visit(candidate) {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) return null;
    seen.add(candidate);
    if (!Array.isArray(candidate)) {
      const id = candidate.id ?? candidate.sequenceId;
      const decisions = candidate.programDecisions;
      if (Array.isArray(decisions)) {
        if (!fallback || decisions.length > (fallback.programDecisions?.length ?? 0)) fallback = candidate;
        if (id === activeSequenceId) return candidate;
      }
    }
    for (const child of Array.isArray(candidate) ? candidate : Object.values(candidate)) {
      const match = visit(child);
      if (match) return match;
    }
    return null;
  }

  return visit(value) ?? fallback;
}

function localMediaUrl(rawValue, key, origin) {
  if (typeof rawValue !== "string" || !key.toLowerCase().includes("proxy")) return rawValue;
  let localPath = rawValue;
  if (rawValue.startsWith("file://")) {
    try {
      localPath = fileURLToPath(rawValue);
    } catch {
      return rawValue;
    }
  }
  if (!path.isAbsolute(localPath)) return rawValue;
  const managed =
    localPath.startsWith("/Volumes/My Passport/Quipsly Media Vault/") ||
    localPath.startsWith("/Users/wall-e/Library/Application Support/Quipsly/MediaVault/");
  if (!managed) return rawValue;
  const url = new URL("/api/local-media", origin);
  url.searchParams.set("path", localPath);
  return url.toString();
}

function mapManagedProxyUrls(value, origin, key = "") {
  if (Array.isArray(value)) return value.map((item) => mapManagedProxyUrls(item, origin, key));
  if (!value || typeof value !== "object") return localMediaUrl(value, key, origin);
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      mapManagedProxyUrls(child, origin, childKey),
    ]),
  );
}

async function main() {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const sessionPath = values.get("session");
  if (!sessionPath) throw new Error("Required: --session=/absolute/path/to/session.quipsly-session.json");

  const projectSlug = values.get("project-slug") ?? "high-ground-odyssey";
  const episodeSlug = values.get("episode-slug") ?? "episode-4-part-2";
  const appOrigin = values.get("app-origin") ?? "http://127.0.0.1:3012";
  const workspaceSlug = values.get("workspace-slug") ?? "hgo-workspace";
  const accessEmails = (values.get("access-emails") ??
    "charlie@highgroundodyssey.com,charlie.local@quipsly.test,codex@dev.test")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/high_ground_studio";

  const raw = await fs.readFile(sessionPath);
  const session = JSON.parse(raw.toString("utf8"));
  const audioDriftAuditPath = values.get("audio-drift-audit");
  if (session.syncRepair && !audioDriftAuditPath) {
    throw new Error(
      "A sync-repaired session requires --audio-drift-audit=/absolute/path/to/passing-report.json.",
    );
  }
  let audioDriftAuditReceipt = null;
  if (audioDriftAuditPath) {
    const auditRaw = await fs.readFile(audioDriftAuditPath);
    const audit = JSON.parse(auditRaw.toString("utf8"));
    if (audit.status !== "pass" || (audit.hardStops?.length ?? 0) > 0) {
      throw new Error("Audio drift audit has not passed; refusing baseline promotion.");
    }
    if (
      audit.sessionPath &&
      path.resolve(audit.sessionPath) !== path.resolve(sessionPath)
    ) {
      throw new Error("Audio drift audit belongs to a different native session.");
    }
    audioDriftAuditReceipt = {
      sourcePath: path.resolve(audioDriftAuditPath),
      sourceSha256: crypto.createHash("sha256").update(auditRaw).digest("hex"),
      status: audit.status,
      generatedAt: audit.generatedAt ?? null,
      thresholds: audit.thresholds ?? null,
      hardStopCount: audit.hardStops?.length ?? 0,
    };
  }
  const sourceSequence = findActiveSequence(session, session.activeSequenceId);
  if (!sourceSequence) throw new Error("No sequence with program decisions was found in the native session.");
  const sequence = mapManagedProxyUrls(sourceSequence, appOrigin);
  const sourceHash = crypto.createHash("sha256").update(raw).digest("hex");
  const rawSequenceTitle = sequence.title ?? "Episode 4 Part 2 Producer Edit";
  const sourceVersion = path.basename(sessionPath).match(/v\d+/i)?.[0] ?? null;
  const sequenceTitle =
    session.syncRepair && sourceVersion
      ? /v\d+/i.test(rawSequenceTitle)
        ? rawSequenceTitle.replace(/v\d+/i, sourceVersion)
        : `${rawSequenceTitle} - ${sourceVersion}`
      : rawSequenceTitle;

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const workspaceResult = await client.query(
      'SELECT id FROM "StudioWorkspace" WHERE slug = $1 LIMIT 1',
      [workspaceSlug],
    );
    let workspaceId = workspaceResult.rows[0]?.id;
    if (!workspaceId) {
      workspaceId = deterministicId("workspace", workspaceSlug);
      await client.query(
        'INSERT INTO "StudioWorkspace" (id,slug,name,"ownerLabel","updatedAt") VALUES ($1,$2,$3,$4,NOW())',
        [workspaceId, workspaceSlug, "High Ground Odyssey", "High Ground Odyssey"],
      );
    }

    const projectResult = await client.query(
      'SELECT id FROM "StudioProject" WHERE slug = $1 ORDER BY "createdAt" LIMIT 1',
      [projectSlug],
    );
    let projectId = projectResult.rows[0]?.id;
    if (!projectId) {
      projectId = deterministicId("project", `${workspaceSlug}:${projectSlug}`);
      await client.query(
        'INSERT INTO "StudioProject" (id,"workspaceId",slug,name,description,"sourceLabel","isPrivate","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW())',
        [
          projectId,
          workspaceId,
          projectSlug,
          "High Ground Odyssey",
          "High Ground Odyssey book, podcast, research, and publishing work.",
          "Quipsly Studio local dogfood",
        ],
      );
    }

    const documentStableId = `${episodeSlug}-producer-edit`;
    const documentId = deterministicId("document", `${projectSlug}:${documentStableId}`);
    await client.query(
      `INSERT INTO "StudioDocument" (id,"projectId","stableId",title,"sourceLabel","projectionStatus","isPrivate","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'private',TRUE,NOW())
       ON CONFLICT ("stableId") DO UPDATE SET title=EXCLUDED.title,"updatedAt"=NOW()`,
      [documentId, projectId, documentStableId, sequenceTitle, "Imported native Quipsly Studio session"],
    );
    const resolvedDocument = await client.query(
      'SELECT id FROM "StudioDocument" WHERE "stableId" = $1 LIMIT 1',
      [documentStableId],
    );

    const existingEpisode = await client.query(
      'SELECT id,"timelineJson" FROM "StudioEpisodeProduction" WHERE "projectId"=$1 AND slug=$2 LIMIT 1',
      [projectId, episodeSlug],
    );
    if (existingEpisode.rows[0]?.timelineJson && !flags.has("replace")) {
      throw new Error(
        `Episode ${episodeSlug} already has timeline data. Refusing to overwrite it; pass --replace only after preserving the current branch.`,
      );
    }
    if (existingEpisode.rows[0]?.id && flags.has("replace")) {
      const branchSafety = await client.query(
        `SELECT
           COUNT(DISTINCT branch.id)::int AS "branchCount",
           COUNT(DISTINCT branch.id) FILTER (WHERE branch."headRevision" > 0)::int AS "editedBranchCount",
           COUNT(operation.id) FILTER (WHERE operation.revision > 0)::int AS "editOperationCount"
         FROM "StudioEditBaseline" baseline
         LEFT JOIN "StudioEditBranch" branch ON branch."baselineId"=baseline.id
         LEFT JOIN "StudioEditOperation" operation ON operation."branchId"=branch.id
         WHERE baseline."episodeProductionId"=$1`,
        [existingEpisode.rows[0].id],
      );
      const safety = branchSafety.rows[0] ?? {};
      if ((safety.editedBranchCount ?? 0) > 0 || (safety.editOperationCount ?? 0) > 0) {
        throw new Error(
          "Refusing replacement because the browser baseline contains real edit history.",
        );
      }
      await client.query(
        'DELETE FROM "StudioEditBaseline" WHERE "episodeProductionId"=$1',
        [existingEpisode.rows[0].id],
      );
    }

    const episodeId = existingEpisode.rows[0]?.id ?? deterministicId("episode", `${projectSlug}:${episodeSlug}`);
    const productionJson = {
      nativeSessionImport: {
        sourcePath: path.resolve(sessionPath),
        sourceSha256: sourceHash,
        activeSequenceId: session.activeSequenceId ?? sequence.id ?? null,
        nativeSavedAt: session.savedAt ?? null,
        importedAt: new Date().toISOString(),
        appOrigin,
        proxyPolicy: "managed-proxies-only",
        syncRepair: session.syncRepair ?? null,
        audioDriftAudit: audioDriftAuditReceipt,
      },
    };
    await client.query(
      `INSERT INTO "StudioEpisodeProduction"
       (id,"projectId","documentId",slug,title,"boundaryLabel","boundaryKind",status,"timelineJson","productionJson","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,'episode','draft',$7::jsonb,$8::jsonb,NOW())
       ON CONFLICT ("projectId",slug) DO UPDATE SET
         title=EXCLUDED.title,"documentId"=EXCLUDED."documentId","timelineJson"=EXCLUDED."timelineJson",
         "productionJson"=EXCLUDED."productionJson","updatedAt"=NOW()`,
      [
        episodeId,
        projectId,
        resolvedDocument.rows[0].id,
        episodeSlug,
        sequenceTitle,
        "Episode 4 Part 2",
        JSON.stringify(sequence),
        JSON.stringify(productionJson),
      ],
    );

    for (const email of accessEmails) {
      await client.query(
        `INSERT INTO "StudioProjectAccessGrant" (id,"projectId",email,role,status,note,"updatedAt")
         VALUES ($1,$2,$3,'EDITOR','ACTIVE',$4,NOW())
         ON CONFLICT ("projectId",email) DO UPDATE SET role='EDITOR',status='ACTIVE',"updatedAt"=NOW()`,
        [
          deterministicId("grant", `${projectId}:${email}`),
          projectId,
          email,
          "Local Episode 4 Part 2 browser-editor dogfood",
        ],
      );
    }
    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          status: "imported",
          projectSlug,
          episodeSlug,
          episodeId,
          sequenceId: sequence.id ?? session.activeSequenceId ?? null,
          title: sequenceTitle,
          programDecisionCount: sequence.programDecisions?.length ?? 0,
          accessEmails,
          sourceSha256: sourceHash,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
