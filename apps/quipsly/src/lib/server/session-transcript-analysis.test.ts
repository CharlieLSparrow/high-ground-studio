/** @jest-environment node */

import {
  analyzeSessionTranscript,
  sessionAnalysisSourceFingerprint,
  validateSessionAnalysisOutput,
  restoreSessionTranscriptAnalysis,
  type SessionAnalysisSource,
} from "./session-transcript-analysis";

const source = (): SessionAnalysisSource => ({
  roomId: "session-1", purpose: "COACHING",
  segments: [{ id: "passage-1", transcriptJobId: "job-1", recordingAssetId: "audio-1",
    speakerLabel: "Client", startSeconds: 12.5, endSeconds: 22,
    text: "My goal is certification by Friday. I will send the recording tomorrow. I want accountability without daily reminders." }],
});
const output = () => ({
  goals: [{ sourceId: "passage-1", title: "Certification by Friday", excerpt: "My goal is certification by Friday." }],
  tasks: [{ sourceId: "passage-1", title: "Send the recording tomorrow", excerpt: "I will send the recording tomorrow." }],
  notes: [{ sourceId: "passage-1", title: "Accountability without daily reminders", excerpt: "I want accountability without daily reminders." }],
});

test("one passage can produce all three types with canonical source timing and identity", () => {
  const result = validateSessionAnalysisOutput(source(), JSON.stringify(output()));
  expect(result.map(item => item.kind)).toEqual(["goal", "task", "note"]);
  expect(new Set(result.map(item => item.id)).size).toBe(3);
  for (const item of result) expect(item).toMatchObject({ sourceId: "passage-1",
    transcriptJobId: "job-1", recordingAssetId: "audio-1", startSeconds: 12.5, endSeconds: 22 });
});

test("duplicates do not create more work; reworded titles preserve item identity", () => {
  const original = output();
  const before = validateSessionAnalysisOutput(source(), JSON.stringify(original));
  original.tasks.push({ ...original.tasks[0], title: "Share my recording tomorrow" });
  const after = validateSessionAnalysisOutput(source(), JSON.stringify(original));
  expect(after).toHaveLength(3);
  expect(after.map(item => item.id)).toEqual(before.map(item => item.id));
});

test("stored results are validated again and cannot replace canonical timing or identity", async () => {
  const input = source();
  const analysis = await analyzeSessionTranscript(input, { name: "test", model: "synthetic", generate: async () => JSON.stringify(output()) });
  analysis.items[0]!.startSeconds = 999;
  analysis.items[0]!.recordingAssetId = "wrong-asset";
  analysis.items[0]!.id = "wrong-work-id";
  const restored = restoreSessionTranscriptAnalysis(input, analysis);
  expect(restored.items[0]).toMatchObject({ startSeconds: 12.5, recordingAssetId: "audio-1" });
  expect(restored.items[0]!.id).not.toBe("wrong-work-id");
  analysis.items[0]!.excerpt = "Invented statement.";
  expect(() => restoreSessionTranscriptAnalysis(input, analysis)).toThrow("UNSUPPORTED_SOURCE");
});

test.each(["roomId", "purpose", "text", "speakerLabel", "startSeconds", "endSeconds", "id", "transcriptJobId", "recordingAssetId"])(
  "source fingerprint changes with %s", field => {
    const original = source();
    const changed = source();
    if (field === "roomId" || field === "purpose") changed[field] += "-changed";
    else if (field === "startSeconds" || field === "endSeconds") changed.segments[0][field] += 0.5;
    else (changed.segments[0] as unknown as Record<string, unknown>)[field] += "-changed";
    expect(sessionAnalysisSourceFingerprint(changed)).not.toBe(sessionAnalysisSourceFingerprint(original));
  },
);

test.each([
  { sourceId: "another-session-passage" },
  { excerpt: "I want daily reminders." },
  { excerpt: "My goal is certification tomorrow." },
])("rejects invented or contradicted source quotations: %j", change => {
  const value = output();
  Object.assign(value.notes[0], change);
  expect(() => validateSessionAnalysisOutput(source(), JSON.stringify(value)))
    .toThrow("UNSUPPORTED_SOURCE");
});

test.each(["ownerUserId", "startSeconds", "permission", "sendEmail"])("rejects model-supplied %s", field => {
  const value = output();
  Object.assign(value.tasks[0], { [field]: "not model authority" });
  expect(() => validateSessionAnalysisOutput(source(), JSON.stringify(value))).toThrow("INVALID_OUTPUT");
});

test("rejects duplicate source identities and invalid source duration", () => {
  const value = source();
  value.segments.push({ ...value.segments[0] });
  expect(() => sessionAnalysisSourceFingerprint(value)).toThrow("INVALID_SOURCE");
  value.segments.pop();
  value.segments[0].endSeconds = value.segments[0].startSeconds;
  expect(() => sessionAnalysisSourceFingerprint(value)).toThrow("INVALID_SOURCE");
});

test("empty useful output is valid; malformed, oversized and incomplete output is not", () => {
  expect(validateSessionAnalysisOutput(source(), '{"goals":[],"tasks":[],"notes":[]}')).toEqual([]);
  for (const raw of ["not JSON", " ".repeat(100_001), '{"notes":[]}']) {
    expect(() => validateSessionAnalysisOutput(source(), raw)).toThrow("INVALID_OUTPUT");
  }
});

test("in-flight source changes cannot attach output to new words or timing", async () => {
  const input = source();
  const fingerprint = sessionAnalysisSourceFingerprint(input);
  const result = await analyzeSessionTranscript(input, { name: "test", model: "synthetic",
    generate: async () => {
      input.segments[0].text = "Unrelated replacement";
      input.segments[0].startSeconds = 18;
      input.roomId = "other-session";
      return JSON.stringify(output());
    },
  });
  expect(result.roomId).toBe("session-1");
  expect(result.sourceFingerprint).toBe(fingerprint);
  expect(result.items[0].startSeconds).toBe(12.5);
  expect(result.sourceFingerprint).not.toBe(sessionAnalysisSourceFingerprint(input));
});

test("oversized inputs are not silently truncated or sent to the provider", async () => {
  const input = source();
  input.segments[0].text = "word ".repeat(30_000);
  const generate = jest.fn();
  await expect(analyzeSessionTranscript(input, { name: "test", model: "synthetic", generate }))
    .rejects.toThrow("INPUT_TOO_LARGE");
  expect(generate).not.toHaveBeenCalled();
});

test("provider errors do not leak private transcript text or credentials", async () => {
  await expect(analyzeSessionTranscript(source(), { name: "test", model: "synthetic",
    generate: async () => { throw new Error("secret credential and private session content"); },
  })).rejects.toThrow(/^Session analysis: PROVIDER_UNAVAILABLE$/);
});

test("a provider ignoring cancellation still cannot hold the caller indefinitely", async () => {
  jest.useFakeTimers();
  try {
    let signal: AbortSignal | undefined;
    const result = analyzeSessionTranscript(source(), { name: "test", model: "synthetic",
      generate: input => { signal = input.signal; return new Promise(() => {}); },
    });
    const rejected = expect(result).rejects.toThrow("PROVIDER_UNAVAILABLE");
    await jest.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
