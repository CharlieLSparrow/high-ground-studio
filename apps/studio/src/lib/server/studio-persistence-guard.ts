const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getStudioDatabaseUrl() {
  return process.env.DATABASE_URL ?? "";
}

export function getStudioDatabaseHost() {
  const databaseUrl = getStudioDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

export function isLocalStudioDatabaseTarget() {
  const host = getStudioDatabaseHost();

  return host ? LOCAL_DATABASE_HOSTS.has(host) : false;
}

export function canWriteStudioDevData() {
  return process.env.NODE_ENV !== "production" && isLocalStudioDatabaseTarget();
}
