import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// Authenticate and join through Nest, exactly like a client. No provider admin
// key, direct database mutation, or production destination is accepted.
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const base = new URL(required("QUIPSLY_CAPTURE_UI_TEST_BASE_URL"));
if (!["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Local Nest required");
const peer = required("QUIPSLY_SYNTHETIC_VIDEO_PEER");
const request = async (url, body, token) => {
  const response = await fetch(url, { method: "POST", headers: {
    "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Local test request failed (${response.status})`);
  return response.json();
};
const identity = await request("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test", {
  email: required("QUIPSLY_CAPTURE_UI_TEST_EMAIL"), password: required("QUIPSLY_CAPTURE_UI_TEST_PASSWORD"), returnSecureToken: true,
});
if (!identity.idToken) throw new Error("Local test authentication failed");
const children = [];
const stop = () => { for (const child of children) child.kill("SIGTERM"); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  const completions = [];
  for (const blue of [false, true]) {
    const join = await request(new URL("/api/mobile/capture/rooms/join", base), {
      callRoomId: required("QUIPSLY_CAPTURE_UI_TEST_SESSION_ID"),
      clientInstanceId: `synthetic-video-${randomUUID()}`, clientKind: "ios",
      deviceLabel: "Synthetic video test peer", endpointRole: "companion",
    }, identity.idToken);
    if (!join.participantToken || !join.serverUrl) throw new Error("Local room token missing");
    const child = spawn(peer, [], { stdio: ["pipe", "inherit", "inherit"] });
    children.push(child);
    completions.push(new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 || signal === "SIGTERM"
        ? resolve() : reject(new Error("Synthetic video peer failed")));
    }));
    child.stdin.end(JSON.stringify({ serverUrl: join.serverUrl, participantToken: join.participantToken,
      durationSeconds: 600, blue }));
    console.log(`Synthetic video peer started (process ${child.pid})`);
  }
  await Promise.all(completions);
} finally {
  stop();
}
