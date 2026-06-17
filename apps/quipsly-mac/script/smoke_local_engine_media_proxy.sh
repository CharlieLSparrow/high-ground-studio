#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
SOURCE_PATH="${3:-/Users/wall-e/Desktop/Podcast/2/Be a Goldfish.mp4}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
LOCAL_ENGINE_WS="${LOCAL_ENGINE_WS:-ws://127.0.0.1:4000}"

echo "== Quipsly Local Engine media proxy smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"
echo "Source:  $SOURCE_PATH"
echo "Engine:  $LOCAL_ENGINE_WS"

if [ ! -f "$SOURCE_PATH" ]; then
  echo "FAIL: source file does not exist: $SOURCE_PATH" >&2
  exit 1
fi

node - "$LOCAL_ENGINE_WS" "$SOURCE_PATH" "$PROJECT_SLUG" "$EPISODE_SLUG" "$REPO_ROOT/apps/local-engine/node_modules/ws" <<'NODE'
const fs = require('fs');
const [engineUrl, sourcePath, projectSlug, episodeSlug, wsModulePath] = process.argv.slice(2);
const WebSocket = require(wsModulePath);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const payload = {
  id: `local-engine-proxy-smoke-${Date.now()}`,
  path: sourcePath,
  displayName: sourcePath.split('/').pop() || 'media-file',
  isFolder: false,
  projectSlug,
  episodeSlug,
  homeNestSlug: 'home-charlie-at-highgroundodyssey-com',
  nestBaseURL: 'https://nest.quipsly.com',
  role: 'reference_clip',
  status: 'queued',
  autoRegisterAfterProxy: false,
  queuedAt: new Date().toISOString(),
  message: 'Quipsly Mac smoke: probe and proxy only.',
};

const ws = new WebSocket(engineUrl);
let sawUnknownCommandError = false;
let sawProbe = false;
let sawProxy = false;
let proxyPath = '';
let thumbnailPath = '';
let durationSeconds = 0;
let proxyKind = '';

const timeout = setTimeout(() => {
  ws.close();
  fail(`Timed out waiting for media proxy result. sawProbe=${sawProbe} sawProxy=${sawProxy}`);
}, 60_000);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'GENERATE_MEDIA_PROXY', payload: { path: sourcePath } }));
  setTimeout(() => {
    ws.send(JSON.stringify({ type: 'QUEUE_EPISODE_IMPORT', payload }));
    ws.send(JSON.stringify({ type: 'PROBE_MEDIA_FILE', payload }));
  }, 100);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === 'ENGINE_COMMAND_ERROR' && message.payload?.code === 'unknown-command') {
    sawUnknownCommandError = true;
    return;
  }

  if (message.type === 'MEDIA_PROBE_RESULT') {
    if (!message.payload?.probe?.ok) {
      clearTimeout(timeout);
      ws.close();
      fail(message.payload?.probe?.error || 'Probe returned not-ok.');
    }

    sawProbe = true;
    ws.send(JSON.stringify({
      type: 'GENERATE_EPISODE_PROXY',
      payload: { ...payload, probe: message.payload.probe },
    }));
    return;
  }

  if (message.type === 'MEDIA_PROXY_RESULT') {
    const proxy = message.payload?.proxy;
    if (proxy?.error) {
      clearTimeout(timeout);
      ws.close();
      fail(proxy.error);
    }

    sawProxy = true;
    proxyPath = proxy?.proxyPath || '';
    thumbnailPath = proxy?.thumbnailPath || '';
    durationSeconds = Number(proxy?.durationSeconds || 0);
    proxyKind = proxy?.kind || '';
    if (message.payload?.status !== 'proxy-ready') {
      clearTimeout(timeout);
      ws.close();
      fail(`Expected local-only proxy-ready status, got ${message.payload?.status || 'none'}.`);
    }
    clearTimeout(timeout);
    ws.close();
  }
});

ws.on('error', (error) => {
  clearTimeout(timeout);
  fail(error.message);
});

ws.on('close', () => {
  if (!sawUnknownCommandError) fail('Unknown-command diagnostic was not visible.');
  if (!sawProbe) fail('Probe result was not received.');
  if (!sawProxy) fail('Proxy result was not received.');
  if (!proxyPath || !fs.existsSync(proxyPath)) fail(`Proxy file missing: ${proxyPath}`);
  if (proxyKind === 'video' && (!thumbnailPath || !fs.existsSync(thumbnailPath))) {
    fail(`Thumbnail file missing: ${thumbnailPath}`);
  }

  const proxyBytes = fs.statSync(proxyPath).size;
  const thumbBytes = thumbnailPath && fs.existsSync(thumbnailPath) ? fs.statSync(thumbnailPath).size : 0;
  console.log(JSON.stringify({
    ok: true,
    sourcePath,
    proxyPath,
    thumbnailPath,
    durationSeconds,
    kind: proxyKind,
    proxyBytes,
    thumbnailBytes: thumbBytes,
    unknownCommandDiagnosticVisible: sawUnknownCommandError,
  }, null, 2));
});
NODE

echo "PASS: Local Engine media proxy smoke completed."
