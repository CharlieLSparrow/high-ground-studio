import type { ApiEndpointProjection } from "./index";
import { apiEndpoints } from "./seed";

type OpenApiMethod = "get" | "post";

interface OpenApiParameter {
  name: string;
  in: "query" | "path";
  description?: string;
  required?: boolean;
  schema: {
    type: "string" | "integer";
    enum?: readonly string[];
    minimum?: number;
    maximum?: number;
  };
}

interface OpenApiResponse {
  description: string;
}

interface OpenApiOperation {
  operationId: string;
  tags: string[];
  summary: string;
  description: string;
  parameters?: OpenApiParameter[];
  responses: Record<string, OpenApiResponse>;
  requestBody?: {
    required: boolean;
    content: {
      "application/json": {
        schema: {
          type: "object";
          additionalProperties: boolean;
          properties?: Record<string, { type: string }>;
        };
      };
    };
  };
}

interface QuipslyOpenApiDocument {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    summary: string;
  };
  servers: {
    url: string;
  }[];
  tags: {
    name: string;
  }[];
  paths: Record<string, Partial<Record<OpenApiMethod, OpenApiOperation>>>;
  components: {
    parameters: {
      Slug: {
        name: "slug";
        in: "path";
        required: true;
        schema: {
          type: "string";
        };
      };
      SessionId: {
        name: "sessionId";
        in: "path";
        required: true;
        schema: {
          type: "string";
        };
      };
    };
    schemas: {
      VerificationStatus: {
        type: "string";
        enum: readonly string[];
      };
      ResearchQueueStatus: {
        type: "string";
        enum: readonly string[];
      };
      StreamMode: {
        type: "string";
        enum: readonly string[];
      };
      EndpointCatalog: {
        type: "object";
        properties: {
          id: {
            type: "string";
          };
          method: {
            type: "string";
          };
          path: {
            type: "string";
          };
          title: {
            type: "string";
          };
          description: {
            type: "string";
          };
          gatewayUse: {
            type: "string";
          };
          example: {
            type: "object";
            properties: {
              label: { type: "string" };
              path: { type: "string" };
              description: { type: "string" };
            };
          };
        };
      };
    };
  };
}

const VERIFICATION_STATUSES = [
  "verified",
  "attributed",
  "variant",
  "disputed",
  "misattributed",
  "needs-source",
  "needs-review",
] as const;

const RESEARCH_STATUSES = [
  "ready-for-review",
  "needs-source",
  "rights-review",
  "variant-check",
  "blocked",
] as const;

const STREAM_MODES = [
  "for-you",
  "verified",
  "by-theme",
  "by-person",
  "by-source",
  "lorelist-builder",
  "story-trail",
  "newly-reviewed",
  "curator-picks",
] as const;

const POST_PATH_TO_REQUEST_BODY: Record<string, OpenApiOperation["requestBody"]> = {
  "/v1/quipstream/sessions": {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: { type: "string" },
            startingMode: { type: "string" },
          },
        },
      },
    },
  },
  "/v1/quipstream/events": {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            sessionId: { type: "string" },
            eventType: { type: "string" },
            mode: { type: "string" },
            quoteId: { type: "string" },
          },
        },
      },
    },
  },
};

const QUERY_PARAMS_BY_ENDPOINT_ID: Record<
  string,
  ReadonlyArray<OpenApiParameter>
> = {
  "api-quotes-search": [
    {
      name: "q",
      in: "query",
      schema: { type: "string" },
      description: "Search within quote text, source, and context.",
    },
    {
      name: "status",
      in: "query",
      schema: { type: "string", enum: VERIFICATION_STATUSES },
      description: "Filter by verification state.",
    },
    {
      name: "theme",
      in: "query",
      schema: { type: "string" },
      description: "Filter by theme slug, e.g. courage.",
    },
    {
      name: "limit",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 50 },
      description: "Max number of rows.",
    },
  ],
  "api-research-queue": [
    {
      name: "status",
      in: "query",
      schema: {
        type: "string",
        enum: RESEARCH_STATUSES,
      },
      description: "Filter queue by work status.",
    },
    {
      name: "limit",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 50 },
      description: "Max number of queue items.",
    },
  ],
  "api-stream-next": [
    {
      name: "mode",
      in: "query",
      schema: { type: "string", enum: STREAM_MODES },
      description: "Stream mode to return the next card from.",
    },
    {
      name: "cursor",
      in: "query",
      schema: { type: "integer", minimum: 0 },
      description: "Optional cursor position.",
    },
  ],
};

function toOperationId(method: ApiEndpointProjection["method"], path: string) {
  const segments = path
    .replace(/^\//, "")
    .replace(/\{([^}]+)\}/g, "$1")
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment
        .split("-")
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(""),
    )
    .join("");

  return `${method.toLowerCase()}${segments || "Root"}Route`;
}

function parameterFromPath(path: string): OpenApiParameter[] {
  const matches = Array.from(path.matchAll(/\{([^}]+)\}/g));
  const slugName = matches.find((match) => match[1] === "slug")?.[1];

  return matches.map((match) => {
    const name = match[1];
    if (name === "slug") {
      return {
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      };
    }

    if (name === "sessionId") {
      return {
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      };
    }

    return {
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
      description: "Route-specific identifier.",
    };
  });
}

function hasNotFoundResponse(path: string): boolean {
  return path.includes("{slug}") || path.includes("{sessionId}");
}

function operationForEndpoint(endpoint: ApiEndpointProjection): OpenApiOperation {
  const methodKey = endpoint.method.toLowerCase() as OpenApiMethod;
  const operationId = toOperationId(endpoint.method, endpoint.path);
  const pathParameters = parameterFromPath(endpoint.path);
  const queryParams = QUERY_PARAMS_BY_ENDPOINT_ID[endpoint.id] ?? [];
  const methodDescription = `${endpoint.title}: ${endpoint.description}`;

  const responses: Record<string, OpenApiResponse> = {
    "200": {
      description: `${endpoint.title} response.`,
    },
  };

  if (hasNotFoundResponse(endpoint.path)) {
    responses["404"] = {
      description: `The requested resource for this route was not found.`,
    };
  }

  const operation: OpenApiOperation = {
    operationId,
    tags: [endpoint.group],
    summary: endpoint.title,
    description: methodDescription,
    responses,
  };

  const parameters: OpenApiParameter[] = [...pathParameters, ...queryParams];
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  if (endpoint.method === "POST" && POST_PATH_TO_REQUEST_BODY[endpoint.path]) {
    operation.requestBody = POST_PATH_TO_REQUEST_BODY[endpoint.path];
  }

  return operation;
}

export function buildQuipslyOpenApiDocument(origin: string): QuipslyOpenApiDocument {
  const paths = apiEndpoints.reduce((acc, endpoint) => {
    const method = endpoint.method.toLowerCase() as OpenApiMethod;
    const path = endpoint.path;
    const operation = operationForEndpoint(endpoint);

    const prior = acc[path] ?? {};
    acc[path] = {
      ...prior,
      [method]: operation,
    };
    return acc;
  }, {} as QuipslyOpenApiDocument["paths"]);

  const tags = Array.from(new Set(apiEndpoints.map((endpoint) => endpoint.group))).map(
    (name) => ({ name }),
  );

  return {
    openapi: "3.1.0",
    info: {
      title: "Quipsly API",
      version: "0.1.0-prototype",
      summary:
        "Source-aware quote discovery, story, merch, stream, and research projections.",
    },
    servers: [{ url: origin }],
    tags,
    paths,
    components: {
      parameters: {
        Slug: {
          name: "slug",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        SessionId: {
          name: "sessionId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      },
      schemas: {
        VerificationStatus: {
          type: "string",
          enum: VERIFICATION_STATUSES,
        },
        ResearchQueueStatus: {
          type: "string",
          enum: RESEARCH_STATUSES,
        },
        StreamMode: {
          type: "string",
          enum: STREAM_MODES,
        },
        EndpointCatalog: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            method: {
              type: "string",
            },
            path: {
              type: "string",
            },
            title: {
              type: "string",
            },
            description: {
              type: "string",
            },
            gatewayUse: {
              type: "string",
            },
            example: {
              type: "object",
              properties: {
                label: { type: "string" },
                path: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}
