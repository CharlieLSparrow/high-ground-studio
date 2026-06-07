#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function loadJson(filePath, label) {
  if (!filePath) {
    throw new Error(`Missing required --${label} path.`);
  }
  const absolutePath = path.resolve(filePath);
  return {
    absolutePath,
    value: JSON.parse(fs.readFileSync(absolutePath, "utf8")),
  };
}

function replacePlaceholders(workflow, brief) {
  const raw = JSON.stringify(workflow);
  const replaced = raw
    .replaceAll("__QUIPSLY_POSITIVE_PROMPT__", brief.prompt)
    .replaceAll("__QUIPSLY_NEGATIVE_PROMPT__", brief.negativePrompt)
    .replaceAll("__QUIPSLY_ROLE__", brief.role)
    .replaceAll("__QUIPSLY_SUBJECT__", brief.subject)
    .replaceAll("__QUIPSLY_SURFACE__", brief.surface);
  return JSON.parse(replaced);
}

const briefPath = argValue("brief");
const workflowPath = argValue("workflow");
const comfyUrl = argValue("comfy", process.env.COMFYUI_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
const dryRun = hasFlag("dry-run") || !workflowPath;

try {
  const { absolutePath: absoluteBriefPath, value: brief } = loadJson(briefPath, "brief");

  if (!brief?.prompt || !brief?.negativePrompt) {
    throw new Error("Brief JSON must include prompt and negativePrompt.");
  }

  const payload = {
    ok: true,
    mode: dryRun ? "dry-run" : "queue",
    briefPath: absoluteBriefPath,
    comfyUrl,
    role: brief.role,
    subject: brief.subject,
    surface: brief.surface,
    positivePrompt: brief.prompt,
    negativePrompt: brief.negativePrompt,
    note: dryRun
      ? "Dry run only. Pass --workflow path/to/api-workflow.json to queue this prompt in ComfyUI."
      : "Submitting workflow to ComfyUI.",
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  const { absolutePath: absoluteWorkflowPath, value: workflow } = loadJson(workflowPath, "workflow");
  const prompt = replacePlaceholders(workflow, brief);
  const clientId = crypto.randomUUID();

  const response = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      prompt,
    }),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify({
      ok: false,
      status: response.status,
      comfyUrl,
      workflowPath: absoluteWorkflowPath,
      responseBody,
    }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ...payload,
    workflowPath: absoluteWorkflowPath,
    clientId,
    responseBody,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
