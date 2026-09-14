import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, fstatSync, lstatSync, openSync, readlinkSync, readSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Hash actual source inputs once each, independently of Git index/commit state. */
export function sourceFingerprint(repoRoot, scopes) {
  if (!repoRoot || !scopes.length) throw new Error("A repository and source scopes are required.");
  const root = resolve(repoRoot);
  const listingBytes = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...scopes],
    { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const listing = listingBytes.toString("utf8");
  if (!Buffer.from(listing).equals(listingBytes)) throw new Error("Source filenames must be valid UTF-8.");
  const files = [...new Set(listing.split("\0").filter(Boolean))].sort();
  const result = createHash("sha256").update("quipsly-source-content-v2\0");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  for (const file of files) {
    const absolute = resolve(root, file);
    let link;
    try { link = lstatSync(absolute); }
    catch (error) {
      // A deleted tracked file and its later committed deletion have identical
      // executable inputs. Other errors must never produce a healthy fingerprint.
      if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
      throw error;
    }
    if (!link.isFile() && !link.isSymbolicLink()) throw new Error(`Unsupported source input: ${file}`);
    const target = link.isSymbolicLink() ? readlinkSync(absolute) : "";
    const descriptor = openSync(absolute, "r");
    try {
      const before = fstatSync(descriptor, { bigint: true });
      if (!before.isFile()) throw new Error(`Source input is not a regular file: ${file}`);
      const content = createHash("sha256");
      let length;
      while ((length = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) content.update(buffer.subarray(0, length));
      const after = fstatSync(descriptor, { bigint: true });
      const current = statSync(absolute, { bigint: true });
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
          || before.ino !== current.ino || before.dev !== current.dev || before.mtimeNs !== current.mtimeNs
          || (link.isSymbolicLink() && readlinkSync(absolute) !== target)) {
        throw new Error(`Source changed during fingerprinting; retry: ${file}`);
      }
      result.update(JSON.stringify([file, link.isSymbolicLink() ? "symlink" : "file", target,
        (before.mode & 0o111n) !== 0n, content.digest("hex")]));
      result.update("\0");
    } finally { closeSync(descriptor); }
  }
  return result.digest("hex");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${sourceFingerprint(process.argv[2], process.argv.slice(3))}\n`); }
  catch (error) {
    // File contents, environment values, and Git's credential diagnostics never
    // enter lifecycle output. A failure is distinct from an empty source tree.
    process.stderr.write(`Cannot fingerprint local source (${error.code || "invalid or changing input"}). Retry after the source is stable.\n`);
    process.exitCode = 1;
  }
}
