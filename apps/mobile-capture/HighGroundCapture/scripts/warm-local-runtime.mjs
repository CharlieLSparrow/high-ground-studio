import { pathToFileURL } from 'node:url';

// Compilation readiness, not an authentication or product acceptance check.
export const startupRoutes = [
  '/api/mac/firebase-client-config',
  '/api/mac/session-check',
  '/api/mobile/capture/readiness',
  '/api/mobile/capture/entitlements',
  '/api/mobile/capture/review-digest',
  '/api/mobile/capture/sessions',
  '/api/mobile/capture/today',
  '/api/mobile/capture/work',
  '/api/mobile/capture/inbox',
  '/api/mobile/capture/voice-writing',
  '/api/mobile/capture/speech-profile',
  '/api/coaching/forms',
  '/api/coaching/runway',
  '/api/coaching/practice-command',
  '/api/coaching/public',
  '/api/calendar/feeds',
  '/api/calendar/connections/google?view=summary',
];

export async function warmLocalRuntime(baseURL, { fetchImpl = fetch, timeoutMs = 90_000, report = console.log } = {}) {
  const base = new URL(baseURL);
  if (base.username || base.password) throw new Error('Runtime base URL must not contain credentials.');
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    report('Skipping local compilation warm-up for a non-loopback HTTP origin.');
    return [];
  }
  const results = [];
  // Serial requests avoid competing Next compilers on developer machines.
  for (const route of startupRoutes) {
    const started = Date.now();
    report(`Warming local route: ${route}`);
    let response;
    try {
      response = await fetchImpl(new URL(route, base.origin), {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const failure = new Error(`Local startup route ${route} did not respond after ${Date.now() - started}ms (${cause?.name || 'request error'}). Native tests have not started.`, { cause });
      failure.name = cause?.name || 'Error';
      throw failure;
    }
    await response.body?.cancel();
    // Protected routes should reject this deliberately unauthenticated request.
    // Redirects, missing routes, rate limits, and server failures are not ready.
    const acceptable = response.status === 200 ||
      (route !== startupRoutes[0] && [401, 403].includes(response.status));
    if (!acceptable) throw new Error(`Local startup route ${route} returned HTTP ${response.status}.`);
    const result = { route, status: response.status, elapsedMs: Date.now() - started };
    results.push(result);
    report(`Local route ready: ${route} (${result.status}, ${result.elapsedMs}ms)`);
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  warmLocalRuntime(process.argv[2]).catch(error => {
    console.error(`Capture local startup warm-up failed: ${error.message}`);
    process.exitCode = 1;
  });
}
