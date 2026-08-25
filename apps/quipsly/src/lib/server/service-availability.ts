function errorHasCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.code === code) return true;

  const nestedErrors = record.errors;
  if (
    Array.isArray(nestedErrors)
    && nestedErrors.some((nested) => errorHasCode(nested, code))
  ) {
    return true;
  }

  return Boolean(record.cause && errorHasCode(record.cause, code));
}

function errorMessages(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];
  const record = error as Record<string, unknown>;
  const messages = typeof record.message === "string" ? [record.message] : [];
  const nestedErrors = Array.isArray(record.errors)
    ? record.errors.flatMap(errorMessages)
    : [];
  return [
    ...messages,
    ...nestedErrors,
    ...errorMessages(record.cause),
  ];
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  if (
    errorHasCode(error, "ECONNREFUSED")
    || errorHasCode(error, "ETIMEDOUT")
    || errorHasCode(error, "P2028")
  ) {
    return true;
  }

  return errorMessages(error).some((message) => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("connection terminated due to connection timeout")
      || normalized.includes("timeout exceeded when trying to connect")
      || normalized.includes("unable to start a transaction in time")
    );
  });
}

export function isDatabaseSchemaUnavailableError(error: unknown): boolean {
  return errorHasCode(error, "P2021") || errorHasCode(error, "P2022");
}
