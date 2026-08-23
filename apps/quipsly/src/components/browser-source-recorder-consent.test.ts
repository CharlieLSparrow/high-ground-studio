import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("browser retained-source consent", () => {
  it("uses one participant-owned recording choice while keeping transcription independently adjustable", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "const [transcriptionAllowed, setTranscriptionAllowed] = useState(true);",
    );
    expect(source).toContain("transcriptionAllowedRef.current = allowed;");
    expect(source).toContain("transcriptionChoiceInputRef.current?.checked");
    expect(source).toContain("canTranscribe: submittedTranscriptionChoice");
    expect(source).toMatch(
      /ref=\{transcriptionChoiceInputRef\}\s+type="checkbox"\s+checked=\{transcriptionAllowed\}/,
    );
    expect(source).toMatch(
      /disabled=\{\s*!policy \|\|\s*status === "checking" \|\|\s*status === "recording"\s*\}/,
    );
    expect(source).toContain("Allow recording");
    expect(source).toContain('aria-label="Recording consent needed"');
    expect(source).not.toContain('open={status === "recording"}');
    expect(source).toContain("Recording settings ·");
    expect(source).toContain(
      "Quipsly waits for each signed-in person to choose.",
    );
    expect(source).toContain("Record still");
    expect(source).toContain("starts separately.");
    expect(source).toContain("Create a transcript and suggested notes/tasks");
    expect(source).toContain("conversationConnected = true");
    expect(source).toContain(
      'className={conversationConnected ? "" : "hidden"}',
    );
    expect(source).toContain("the Record button appears after you join");
    expect(source).not.toContain("Save my consent receipt");
    expect(source).toContain("Existing recording choices stay saved");
    expect(source).not.toContain("Reconfirm consent");
    expect(source).toContain("Ready to record when everyone is ready.");
    expect(source).toContain("Recording on this device. Your call continues normally.");
    expect(source).not.toContain("Checking durable browser storage and consent");
    expect(source).not.toContain("LOCAL SOURCE RECORDING");
  });
});
