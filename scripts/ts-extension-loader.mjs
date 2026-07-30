export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export default {};",
    };
  }

  // Mock next-auth entrypoint for tests
  if (specifier === "@/auth" || specifier.endsWith("src/auth") || specifier.endsWith("src/auth.ts")) {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const auth = async () => null; export const signIn = async () => {}; export const signOut = async () => {};",
    };
  }

  // Resolve Next.js path alias '@/` to absolute path inside apps/quipsly/src
  if (specifier.startsWith("@/")) {
    specifier = new URL(
      specifier.slice(2),
      new URL("../apps/quipsly/src/", import.meta.url),
    ).href;
  }

  if ((specifier.startsWith(".") || specifier.startsWith("file:///")) && !/\.[a-z]+$/i.test(specifier)) {
    for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
      try {
        return await nextResolve(`${specifier}${extension}`, context);
      } catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND") {
          throw error;
        }
      }
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND"
      && (specifier.startsWith(".") || specifier.startsWith("file:///"))
      && specifier.endsWith(".js")
    ) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    throw error;
  }
}
