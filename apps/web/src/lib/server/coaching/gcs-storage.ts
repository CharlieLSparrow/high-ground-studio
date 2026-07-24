type StorageLike = {
  bucket(name: string): any;
};

type StorageConstructor = new (options?: Record<string, unknown>) => StorageLike;

let cachedStorageConstructor: StorageConstructor | null = null;

function loadStorageConstructor(): StorageConstructor {
  if (cachedStorageConstructor) return cachedStorageConstructor;

  try {
    const requireFn = eval("require") as (id: string) => any;
    const module = requireFn("@google-cloud/storage");
    if (!module?.Storage) {
      throw new Error("@google-cloud/storage did not export Storage.");
    }
    cachedStorageConstructor = module.Storage as StorageConstructor;
    return cachedStorageConstructor;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Google Cloud Storage client is unavailable for coaching capture (${detail}). Install/link @google-cloud/storage or disable server-side capture storage for this runtime.`,
    );
  }
}

function parseCredentials(credentialsJson?: string | null) {
  if (!credentialsJson?.trim()) return null;

  try {
    return JSON.parse(credentialsJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function createCoachingStorageClient(credentialsJson?: string | null) {
  const Storage = loadStorageConstructor();
  const credentials = parseCredentials(credentialsJson);
  return credentials ? new Storage({ credentials }) : new Storage();
}
