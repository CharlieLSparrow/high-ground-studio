#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const recipePath = path.join(repoRoot, "docs/quipsly/art/quipsly-art-recipes.json");
const recipes = JSON.parse(fs.readFileSync(recipePath, "utf8"));

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const role = argValue("role", "librarian");
const subject = argValue("subject", "helping a creator organize source material");
const mood = argValue("mood", "curious, cheerful, useful");
const surface = argValue("surface", "quipsly");
const outDir = path.resolve(argValue("out", path.join(repoRoot, "docs/quipsly/art/generated-briefs")));
const roleRecipe = recipes.roles[role] ?? recipes.roles.librarian;
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, "-");
const slug = `${stamp}-${role}-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "quipsly"}`;
const prompt = [
  recipes.styleBase,
  roleRecipe.prompt,
  `specific subject: ${subject}`,
  `mood: ${mood}`,
  `intended surface: ${surface}`,
  "square composition, clear mascot silhouette, enough empty space for product copy if needed"
].join(", ");

const payload = {
  version: 1,
  createdAt: now.toISOString(),
  role,
  roleLabel: roleRecipe.label,
  subject,
  mood,
  surface,
  prompt,
  negativePrompt: recipes.negativePrompt,
  recommendedSize: "1254x1254",
  ingestTargets: [
    "apps/quipsly/public/images/quipsly-generated",
    "apps/quiplore/public/images/quipsly-generated"
  ],
  comfyUi: {
    note: "Use this prompt in the local ComfyUI workflow. After export, run the ingest script or copy the approved PNG into the generated asset folder and add a named entry to packages/quipsly-domain/src/generated-art.ts.",
    defaultLocalUrl: process.env.COMFYUI_URL || "http://127.0.0.1:8188"
  }
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${slug}.json`), JSON.stringify(payload, null, 2));
fs.writeFileSync(path.join(outDir, `${slug}.md`), `# Quipsly Art Brief: ${roleRecipe.label}\n\n## Prompt\n\n${prompt}\n\n## Negative prompt\n\n${recipes.negativePrompt}\n\n## Intended surface\n\n${surface}\n\n## Ingest note\n\nAfter generation, save the approved PNG into \`apps/quipsly/public/images/quipsly-generated\` and \`apps/quiplore/public/images/quipsly-generated\`, then add a named manifest entry to \`packages/quipsly-domain/src/generated-art.ts\`.\n`);

console.log(JSON.stringify({ ok: true, role, subject, files: [`${slug}.json`, `${slug}.md`], outDir }, null, 2));
