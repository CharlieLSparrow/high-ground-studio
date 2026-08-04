#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const livekitBundle = require.resolve("livekit-client");
const serverUrl = process.env.QUIPSLY_LOCAL_LIVEKIT_URL || "ws://127.0.0.1:7880";
const apiKey = process.env.QUIPSLY_LOCAL_LIVEKIT_KEY || "devkey";
const apiSecret = process.env.QUIPSLY_LOCAL_LIVEKIT_SECRET || "secret";
const roomName = `quipsly-watch-smoke-${randomUUID()}`;
const topic = "quipsly.episode-watch.authority.v1";

function assertLocalWebSocket(value) {
  const url = new URL(value);
  assert(["ws:", "wss:"].includes(url.protocol), "LiveKit URL must use WebSocket transport.");
  assert(["127.0.0.1", "localhost", "::1"].includes(url.hostname), "This smoke refuses non-loopback LiveKit servers.");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function token(identity) {
  const now = Math.floor(Date.now() / 1_000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    exp: now + 300,
    iat: now,
    iss: apiKey,
    jti: randomUUID(),
    nbf: now - 5,
    sub: identity,
    name: identity,
    metadata: JSON.stringify({ purpose: "local-episode-watch-smoke" }),
    video: {
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: roomName,
      roomJoin: true,
    },
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", apiSecret).update(unsigned).digest();
  return `${unsigned}.${base64url(signature)}`;
}

async function main() {
  assertLocalWebSocket(serverUrl);
  const browser = await chromium.launch({ headless: true });
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const [sender, receiver] = await Promise.all(contexts.map(async (context) => {
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:3012/", { waitUntil: "domcontentloaded" });
      await page.addScriptTag({ path: livekitBundle });
      return page;
    }));

    await Promise.all([
      sender.evaluate(async ({ url, jwt }) => {
        const room = new globalThis.LivekitClient.Room();
        await room.connect(url, jwt);
        globalThis.__quipslyRoom = room;
      }, { url: serverUrl, jwt: token("browser-sender") }),
      receiver.evaluate(async ({ url, jwt, expectedTopic }) => {
        const room = new globalThis.LivekitClient.Room();
        globalThis.__quipslyReceived = new Promise((resolve) => {
          room.on(globalThis.LivekitClient.RoomEvent.DataReceived, (bytes, participant, _kind, packetTopic) => {
            if (packetTopic !== expectedTopic) return;
            resolve({
              body: JSON.parse(new TextDecoder().decode(bytes)),
              participantIdentity: participant?.identity || null,
            });
          });
        });
        await room.connect(url, jwt);
        globalThis.__quipslyRoom = room;
      }, { url: serverUrl, jwt: token("browser-receiver"), expectedTopic: topic }),
    ]);

    const hint = {
      schema: "quipsly-episode-watch-hint.v1",
      projectSlug: "local-smoke-project",
      episodeSlug: "local-smoke-episode",
      callRoomId: "local-smoke-session",
      revision: 12,
      receiptId: `receipt-${randomUUID()}`,
      clientRequestId: `command-${randomUUID()}`,
      command: "PAUSE",
      acceptedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    };

    await sender.evaluate(async ({ body, packetTopic }) => {
      await globalThis.__quipslyRoom.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(body)),
        { reliable: true, topic: packetTopic },
      );
    }, { body: hint, packetTopic: topic });

    const received = await Promise.race([
      receiver.evaluate(() => globalThis.__quipslyReceived),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for reliable Watch room data.")), 8_000)),
    ]);
    assert.equal(received.participantIdentity, "browser-sender");
    assert.deepEqual(received.body, hint);
    console.log(JSON.stringify({
      ok: true,
      serverUrl,
      roomName,
      topic,
      participantIdentity: received.participantIdentity,
      revision: received.body.revision,
      receiptId: received.body.receiptId,
    }, null, 2));
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await browser.close();
  }
}

await main();
