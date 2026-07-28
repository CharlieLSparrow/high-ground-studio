#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readAppStoreMetadata,
  validateAppStoreMetadata,
} from "../../../../scripts/release/quipsly-capture-app-store-metadata.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const defaultMetadataPath = path.join(
  repositoryRoot,
  "release/app-store/quipsly-capture/en-US.json",
);

function requiredOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required --${name.replaceAll("_", "-")} option.`);
  }
  return value;
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const key = argument.slice(2).replaceAll("-", "_");
    if (key === "source_dirty") {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Option ${argument} requires a value.`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function flattenAttachments(manifest) {
  if (!Array.isArray(manifest)) {
    throw new Error("The xcresult attachment manifest must be an array.");
  }
  return manifest.flatMap((test) => {
    const attachments = Array.isArray(test?.attachments)
      ? test.attachments
      : test?.attachments
        ? [test.attachments]
        : [];
    return attachments.map((attachment) => ({
      ...attachment,
      testIdentifier: test?.testIdentifier ?? null,
    }));
  });
}

function safeExportedFilename(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && path.basename(value) === value
    && !/[\0\r\n]/.test(value)
  );
}

function imageDimensions(buffer, filename) {
  if (
    buffer.length >= 24
    && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + segmentLength;
    }
  }

  throw new Error(`${filename} is not a readable PNG or JPEG screenshot.`);
}

function attachmentMatchesFilename(attachment, filename) {
  const suggested = attachment.suggestedHumanReadableName;
  const stem = path.parse(filename).name;
  return (
    suggested === filename
    || suggested === stem
    || (typeof suggested === "string" && suggested.startsWith(`${filename}_`))
    || (
      typeof suggested === "string"
      && suggested.startsWith(`${stem}_`)
      && suggested.toLocaleLowerCase().endsWith(path.extname(filename))
    )
  );
}

export function materializeDraftScreenshots({
  metadataPath = defaultMetadataPath,
  manifestPath,
  exportedDirectory,
  outputDirectory,
  sourceRevision,
  sourceDirty = false,
  sourceIsolation = "current-worktree",
  resultBundlePath,
  deviceName,
  deviceId,
  capturedAt = new Date().toISOString(),
}) {
  const metadata = readAppStoreMetadata(metadataPath);
  if (!["current-worktree", "detached-worktree"].includes(sourceIsolation)) {
    throw new Error(
      "sourceIsolation must be current-worktree or detached-worktree.",
    );
  }
  const validation = validateAppStoreMetadata(metadata, {
    root: repositoryRoot,
  });
  if (!validation.ok) {
    throw new Error(
      `Canonical App Store metadata failed before draft capture:\n${validation.errors.join("\n")}`,
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const attachments = flattenAttachments(manifest);
  const screenshotDirectory = path.join(outputDirectory, "screenshots");

  const resolvedScreenshots = metadata.screenshots.planned.map((planned) => {
    const matches = attachments.filter((attachment) => (
      attachmentMatchesFilename(attachment, planned.filename)
    ));
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one xcresult attachment named ${planned.filename}; found ${matches.length}.`,
      );
    }
    const [attachment] = matches;
    if (!safeExportedFilename(attachment.exportedFileName)) {
      throw new Error(
        `Unsafe exported attachment filename for ${planned.filename}.`,
      );
    }

    const sourcePath = path.join(
      exportedDirectory,
      attachment.exportedFileName,
    );
    const bytes = fs.readFileSync(sourcePath);
    const dimensions = imageDimensions(bytes, planned.filename);
    if (
      dimensions.width !== planned.width
      || dimensions.height !== planned.height
    ) {
      throw new Error(
        `${planned.filename} is ${dimensions.width}x${dimensions.height}; `
        + `expected ${planned.width}x${planned.height}.`,
      );
    }

    return {
      planned,
      attachment,
      sourcePath,
      bytes,
      dimensions,
    };
  });

  fs.mkdirSync(outputDirectory, { recursive: true });
  const stagingDirectory = path.join(
    outputDirectory,
    `.screenshots-stage-${process.pid}`,
  );
  if (fs.existsSync(screenshotDirectory) || fs.existsSync(stagingDirectory)) {
    throw new Error(
      `Draft screenshot output already exists under ${outputDirectory}; use a new run directory.`,
    );
  }
  fs.mkdirSync(stagingDirectory);

  let screenshots;
  try {
    screenshots = resolvedScreenshots.map((resolved) => {
      const {
        planned,
        attachment,
        sourcePath,
        bytes,
        dimensions,
      } = resolved;
      fs.copyFileSync(
        sourcePath,
        path.join(stagingDirectory, planned.filename),
      );
      return {
        order: planned.order,
        filename: planned.filename,
        headline: planned.headline,
        story: planned.story,
        width: dimensions.width,
        height: dimensions.height,
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        testIdentifier: attachment.testIdentifier,
        draftPath: path.join(screenshotDirectory, planned.filename),
      };
    });
    fs.renameSync(stagingDirectory, screenshotDirectory);
  } catch (error) {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }

  const receipt = {
    schema: "quipsly-capture-app-store-draft-screenshots-v1",
    capturedAt,
    status: "draft-layout-evidence",
    submissionEligible: false,
    submissionBoundary:
      "DEBUG preview fixtures are private-data-safe layout evidence only. "
      + "Approve only screenshots recaptured from the exact signed candidate "
      + "or its TestFlight install with the synthetic reviewer account.",
    sourceRevision,
    sourceDirty: Boolean(sourceDirty),
    sourceIsolation,
    device: {
      class: metadata.screenshots.deviceClass,
      name: deviceName,
      id: deviceId,
      orientation: metadata.screenshots.orientation,
    },
    resultBundlePath,
    screenshots,
  };
  const receiptPath = path.join(outputDirectory, "draft-receipt.json");
  const temporaryReceiptPath = `${receiptPath}.tmp-${process.pid}`;
  fs.writeFileSync(
    temporaryReceiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  fs.renameSync(temporaryReceiptPath, receiptPath);
  return { receipt, receiptPath, screenshotDirectory };
}

export function runDraftScreenshotCli(argv = process.argv.slice(2)) {
  try {
    const options = parseOptions(argv);
    const result = materializeDraftScreenshots({
      metadataPath: path.resolve(
        options.metadata ?? defaultMetadataPath,
      ),
      manifestPath: path.resolve(requiredOption(options, "manifest")),
      exportedDirectory: path.resolve(
        requiredOption(options, "exported_directory"),
      ),
      outputDirectory: path.resolve(requiredOption(options, "output_directory")),
      sourceRevision: requiredOption(options, "source_revision"),
      sourceDirty: options.source_dirty === true,
      sourceIsolation: options.source_isolation ?? "current-worktree",
      resultBundlePath: path.resolve(requiredOption(options, "result_bundle")),
      deviceName: requiredOption(options, "device_name"),
      deviceId: requiredOption(options, "device_id"),
    });
    console.log(
      `PASS Materialized ${result.receipt.screenshots.length} draft App Store screenshots.`,
    );
    console.log(`PASS Draft receipt: ${result.receiptPath}`);
    console.log(`PASS Draft images: ${result.screenshotDirectory}`);
    console.log("BLOCKED Submission eligibility remains false until signed-candidate recapture and human approval.");
    return 0;
  } catch (error) {
    console.error(
      `FAIL Draft App Store screenshot materialization: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = runDraftScreenshotCli();
}
