import { spawnSync } from "node:child_process";
import path from "node:path";
import { appDirectory, ensureBuildTypescriptConfig } from "./typescript-config.mjs";

const config = ensureBuildTypescriptConfig();
for (const [command, args] of [
  [process.execPath, ["node_modules/next/dist/bin/next", "typegen"]],
  ["tsc", ["--project", config, "--noEmit", "--incremental", "false"]],
]) {
  const result = spawnSync(command, args, {
    cwd: appDirectory,
    env: { ...process.env, PATH: `${path.join(appDirectory, "node_modules/.bin")}${path.delimiter}${process.env.PATH || ""}` },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
