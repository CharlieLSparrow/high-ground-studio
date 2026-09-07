import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function typescriptConfigForBuild(distDir) {
  if (!/^\.next(?:-[a-z0-9]+)*$/.test(distDir)) throw new Error("Invalid Next.js output directory");
  return {
    extends: "./tsconfig.json",
    compilerOptions: { tsBuildInfoFile: `./${distDir}/cache/typescript.tsbuildinfo` },
    include: ["*.ts", "*.tsx", "src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts", `${distDir}/types/**/*.ts`, `${distDir}/dev/types/**/*.ts`],
    exclude: ["node_modules"],
  };
}

// Next adds its generated route validators to the selected tsconfig. Give each
// development/build lane its own file so a stale lab cannot break a release.
export function ensureBuildTypescriptConfig(distDir = process.env.QUIPSLY_BUILD_DIST_DIR || ".next") {
  const config = typescriptConfigForBuild(distDir);
  const filename = `.quipsly-tsconfig-${distDir.slice(1)}.json`;
  const contents = `${JSON.stringify(config, null, 2)}\n`;
  const destination = path.join(appDirectory, filename);
  let previous;
  try { previous = readFileSync(destination, "utf8"); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (previous !== contents) writeFileSync(destination, contents);
  return filename;
}
