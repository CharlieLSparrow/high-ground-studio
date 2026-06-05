import {
  DEFAULT_SOURCE_LIBRARIES,
  SourceLibrary,
  StudioProjectBackend,
  QuipslyLoreBackend,
  SourceBackend,
} from "@high-ground/quipsly-domain/retrieval";

export type RetrievalContext = {
  activeProjectId: string;
};

/**
 * Translates static source libraries into queryable backends by injecting
 * the runtime context (e.g., the user's active projectId).
 */
export function resolveSourceLibrary(
  librarySlug: string,
  context: RetrievalContext,
): SourceLibrary {
  const baseLibrary = DEFAULT_SOURCE_LIBRARIES.find((lib) => lib.slug === librarySlug);

  if (!baseLibrary) {
    throw new Error(`Unknown source library: ${librarySlug}`);
  }

  // If it's the active-manuscript, we construct its backend dynamically
  if (librarySlug === "active-manuscript") {
    return {
      ...baseLibrary,
      backends: [
        {
          type: "studio-project",
          projectId: context.activeProjectId,
        } satisfies StudioProjectBackend,
      ],
    };
  }

  // Otherwise we pass the predefined backends through.
  // In the future, if a static backend needs projectId injected, we can map it here.
  return baseLibrary;
}
