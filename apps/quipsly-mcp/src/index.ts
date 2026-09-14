import { homedir } from "node:os";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { QuipslyApi, readSessionToken } from "./quipsly-api.js";
import { createQuipslyServer } from "./server.js";

async function main() {
  const tokenFile =
    process.env.QUIPSLY_SESSION_TOKEN_FILE ||
    join(homedir(), ".config/quipsly/agent-session.jwt");
  const api = new QuipslyApi({
    baseUrl: process.env.QUIPSLY_API_BASE_URL || "https://nest.quipsly.com",
    token: () => readSessionToken(tokenFile),
  });
  await createQuipslyServer(api).connect(new StdioServerTransport());
}

main().catch(() => {
  console.error(
    "Quipsly agent connection could not start. Check its URL and session-file configuration.",
  );
  process.exitCode = 1;
});
