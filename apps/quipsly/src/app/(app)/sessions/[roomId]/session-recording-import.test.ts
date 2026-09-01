import { createHash } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";

import {
  hashSessionRecordingFile,
  SESSION_RECORDING_EXTERNAL_ATTESTATION,
  SESSION_RECORDING_EXTERNAL_SOURCE_PROFILE,
  sessionRecordingFileType,
  suggestSessionRecordingRange,
} from "./session-recording-import";

describe("Session recording import", () => {
  it("binds browser imports to the canonical external-source authorization lane", () => {
    expect(SESSION_RECORDING_EXTERNAL_SOURCE_PROFILE).toEqual({
      kind: "quipsly-nest-external-recording-import-v1",
      clientKind: "web",
      source: "nest-session-recordings",
      originalPreserved: true,
    });
    expect(SESSION_RECORDING_EXTERNAL_ATTESTATION).toBe(true);
  });

  it("infers camera and recorder media types without trusting an absent browser MIME", () => {
    expect(sessionRecordingFileType({ name: "CANON_R8_0001.MOV", type: "", size: 4096 })).toEqual({
      contentType: "video/quicktime",
      sourceType: "video",
    });
    expect(sessionRecordingFileType({ name: "shure-room-mix.wav", type: "", size: 2048 })).toEqual({
      contentType: "audio/wav",
      sourceType: "audio",
    });
  });

  it("suggests an editable wall-clock range from file time and media duration", () => {
    expect(suggestSessionRecordingRange({
      durationSeconds: 90,
      lastModifiedMs: Date.parse("2026-09-01T14:00:00.000Z"),
      nowMs: Date.parse("2026-09-01T15:00:00.000Z"),
    })).toEqual({
      startedAt: "2026-09-01T13:58:30.000Z",
      stoppedAt: "2026-09-01T14:00:00.000Z",
      durationSeconds: 90,
    });
    expect(suggestSessionRecordingRange({
      durationSeconds: 60,
      lastModifiedMs: Date.parse("2026-09-01T16:00:00.000Z"),
      nowMs: Date.parse("2026-09-01T15:00:00.000Z"),
    })?.stoppedAt).toBe("2026-09-01T15:00:00.000Z");
    expect(suggestSessionRecordingRange({
      durationSeconds: Number.NaN,
      lastModifiedMs: 1,
      nowMs: 2,
    })).toBeNull();
  });

  it("rejects empty and unrecognized files before reserving private storage", () => {
    expect(() => sessionRecordingFileType({ name: "empty.wav", type: "audio/wav", size: 0 })).toThrow(/empty/i);
    expect(() => sessionRecordingFileType({ name: "notes.txt", type: "text/plain", size: 12 })).toThrow(/supported audio or video/i);
  });

  it("incrementally hashes the exact original and reports completion", async () => {
    const bytes = new TextEncoder().encode("Quipsly synthetic recording evidence\n");
    const progress: number[] = [];
    const digest = await hashSessionRecordingFile(new NodeBlob([bytes]) as unknown as Blob, (fraction) => progress.push(fraction));

    expect(digest).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(progress.at(-1)).toBe(1);
  });

  it("honors cancellation before reading another chunk", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(hashSessionRecordingFile(new NodeBlob(["do not hash"]) as unknown as Blob, () => undefined, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
