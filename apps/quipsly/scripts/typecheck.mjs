import { spawnSync } from "node:child_process";
import path from "node:path";
import { appDirectory, ensureBuildTypescriptConfig, typecheckDistDirectory } from "./typescript-config.mjs";

const distDir = typecheckDistDirectory();
const config = ensureBuildTypescriptConfig(distDir);
for (const [command, args] of [
  [process.execPath, ["node_modules/next/dist/bin/next", "typegen"]],
  ["tsc", ["--project", config, "--noEmit", "--incremental", "false"]],
]) {
  const result = spawnSync(command, args, {
    cwd: appDirectory,
    env: { ...process.env, QUIPSLY_BUILD_DIST_DIR: distDir,
      PATH: `${path.join(appDirectory, "node_modules/.bin")}${path.delimiter}${process.env.PATH || ""}` },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
