import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { mkdir, realpath } from "node:fs/promises";

/** Source media is application data, not a cache. Keep defaults consistent in
 * Nest, capture uploads, and standalone media/transcription workers. */
export function defaultLocalMediaRoot() {
  return path.join(homedir(), "Library", "Application Support", "Quipsly", "local-media");
}

export function dedicatedLocalMediaRoot(value: string) {
  if (!path.isAbsolute(value)) throw new Error("Local media requires an absolute dedicated directory.");
  const root = path.resolve(value);
  if ([path.parse(root).root, homedir(), tmpdir(), "/Users", "/Volumes"].map(item => path.resolve(item)).includes(root)) {
    throw new Error("Local media requires a dedicated directory, not a home, volume, or temporary root.");
  }
  return root;
}

/** Resolve symlinks before authorizing a worker's actual storage boundary. */
export async function prepareLocalMediaRoot(value: string) {
  const resolved = dedicatedLocalMediaRoot(value);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  return dedicatedLocalMediaRoot(await realpath(resolved));
}
