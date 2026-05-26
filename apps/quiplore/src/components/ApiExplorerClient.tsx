"use client";

import type { ApiEndpointProjection } from "@high-ground/quipsly-domain";
import { Clipboard, Play } from "lucide-react";
import { useMemo, useState } from "react";

type ApiResult = {
  readonly status: number;
  readonly elapsedMs: number;
  readonly url: string;
  readonly body: string;
  readonly error?: string;
};

const defaultBaseUrl =
  process.env.NEXT_PUBLIC_QUIPSLY_API_BASE_URL ?? "http://127.0.0.1:3004";

function getSampleBody(endpoint: ApiEndpointProjection): string | undefined {
  if (endpoint.id === "api-stream-session") {
    return JSON.stringify(
      {
        mode: "by-theme",
        entrySurface: "api-explorer",
        anonymous: true,
      },
      null,
      2,
    );
  }

  if (endpoint.id === "api-stream-event") {
    return JSON.stringify(
      {
        sessionId: "qss_demo",
        type: "story_interest",
        mode: "by-theme",
        quoteId: "quote-fdr-fear-itself",
        dwellMs: 4200,
        metadata: {
          surface: "api-explorer",
        },
      },
      null,
      2,
    );
  }

  return undefined;
}

function createUrl(baseUrl: string, endpoint: ApiEndpointProjection): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${endpoint.example.path}`;
}

function createCurl(baseUrl: string, endpoint: ApiEndpointProjection): string {
  const body = getSampleBody(endpoint);
  const url = createUrl(baseUrl, endpoint);

  if (body) {
    return `curl -X ${endpoint.method} '${url}' \\
  -H 'Content-Type: application/json' \\
  -d '${body.replace(/\n/g, "").replace(/\s{2,}/g, " ")}'`;
  }

  return `curl '${url}'`;
}

export function ApiExplorerClient({
  endpoints,
}: {
  readonly endpoints: readonly ApiEndpointProjection[];
}) {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [selectedId, setSelectedId] = useState(endpoints[0]?.id ?? "");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.id === selectedId) ?? endpoints[0],
    [endpoints, selectedId],
  );
  const groupedEndpoints = useMemo(
    () =>
      endpoints.reduce<Record<string, readonly ApiEndpointProjection[]>>(
        (groups, endpoint) => ({
          ...groups,
          [endpoint.group]: [...(groups[endpoint.group] ?? []), endpoint],
        }),
        {},
      ),
    [endpoints],
  );

  async function runEndpoint(endpoint = selectedEndpoint) {
    if (!endpoint) {
      return;
    }

    const startedAt = performance.now();
    const body = getSampleBody(endpoint);
    const url = createUrl(baseUrl, endpoint);

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(url, {
        method: endpoint.method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      const text = await response.text();
      let formattedBody = text;
      const elapsedMs = Math.round(performance.now() - startedAt);

      try {
        formattedBody = text ? JSON.stringify(JSON.parse(text), null, 2) : "";
      } catch {
        formattedBody = text;
      }

      setResult({
        status: response.status,
        elapsedMs,
        url,
        body: formattedBody,
      });
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - startedAt);

      setResult({
        status: 0,
        elapsedMs,
        url,
        body: "",
        error:
          error instanceof Error
            ? error.message
            : "Request failed before the API returned a response.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function copyCurl(endpoint = selectedEndpoint) {
    if (!endpoint || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(createCurl(baseUrl, endpoint));
  }

  return (
    <section className="api-explorer">
      <div className="api-endpoint-list">
        <label className="api-base-control">
          <span>API base</span>
          <input
            onChange={(event) => setBaseUrl(event.target.value)}
            spellCheck={false}
            type="url"
            value={baseUrl}
          />
        </label>

        {Object.entries(groupedEndpoints).map(([group, groupEndpoints]) => (
          <div className="api-group" key={group}>
            <span className="nav-label">{group}</span>
            {groupEndpoints.map((endpoint) => (
              <button
                className={`api-endpoint-button ${
                  endpoint.id === selectedEndpoint?.id ? "active" : ""
                }`}
                key={endpoint.id}
                onClick={() => setSelectedId(endpoint.id)}
                type="button"
              >
                <span>{endpoint.method}</span>
                <strong>{endpoint.title}</strong>
              </button>
            ))}
          </div>
        ))}
      </div>

      {selectedEndpoint ? (
        <article className="api-detail panel">
          <div className="api-detail-head">
            <div>
              <span className="section-label">
                {selectedEndpoint.method} {selectedEndpoint.path}
              </span>
              <h2>{selectedEndpoint.title}</h2>
              <p>{selectedEndpoint.description}</p>
            </div>
            <div className="button-row">
              <button
                className="button primary"
                disabled={loading}
                onClick={() => runEndpoint()}
                type="button"
              >
                <Play size={15} aria-hidden="true" />
                Run
              </button>
              <button className="button" onClick={() => copyCurl()} type="button">
                <Clipboard size={15} aria-hidden="true" />
                Curl
              </button>
            </div>
          </div>

          <div className="api-example-grid">
            <div className="meta-item">
              <span>Example</span>
              <strong>{selectedEndpoint.example.label}</strong>
              <p>{selectedEndpoint.example.description}</p>
            </div>
            <div className="meta-item">
              <span>Gateway use</span>
              <strong>{selectedEndpoint.group}</strong>
              <p>{selectedEndpoint.gatewayUse}</p>
            </div>
          </div>

          <div className="api-code-block">
            <span>Request</span>
            <code>{createCurl(baseUrl, selectedEndpoint)}</code>
          </div>

          {result ? (
            <div className={`api-result ${result.status >= 400 ? "error" : ""}`}>
              <div className="api-result-meta">
                <strong>{result.status || "Network error"}</strong>
                <span>{result.elapsedMs}ms</span>
                <span>{result.url}</span>
              </div>
              <pre>{result.error ?? result.body}</pre>
            </div>
          ) : (
            <div className="api-empty-state">
              Select an endpoint and run its sample request.
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
