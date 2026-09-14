/** Retry only aborted database conflicts. The callback must contain database
 * work only; every attempt rechecks access and the original command identity. */
export async function retryCoachingWorkTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (attempt >= 4 || (code !== "P2034" && code !== "P2002")) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt + Math.floor(Math.random() * 20)));
    }
  }
}
