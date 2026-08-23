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
    expect(source).toMatch(
      /if \(consentPacket\?\.session\?\.recordingConsentId\) \{\s*setSourceType\(savedVideoConsent \? "video" : "audio"\);\s*\}/,
    );
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
    expect(source).toContain('data-testid="recording-readiness-message"');
    expect(source).not.toContain(
      "Every signed-in participant must grant the selected recording consent.",
    );
    expect(source).toContain("Recording on this device. Your call continues normally.");
    expect(source).not.toContain("Checking durable browser storage and consent");
    expect(source).not.toContain("LOCAL SOURCE RECORDING");
    expect(source).not.toMatch(
      /canControlRoom\s*&&\s*recordingDirective\s*&&\s*recordingHealthProjection/,
    );
    expect(source).toContain(
      "Open Quipsly on the affected recording device. It will retry",
    );
    expect(source).toContain(
      "Wait for Upload complete before closing a recording device.",
    );
    expect(source).toContain("browserRetainedStartFailure(error, sourceType)");
    expect(source).toContain('kind: "start-failed"');
    expect(source).toContain('data-testid="recording-technical-detail"');
    expect(source).toContain("Your call is still connected.");
    expect(source).not.toContain("The browser source could not start.");
    expect(source).toContain("readBrowserSourcePreferences()");
    expect(source).toContain("preferredBrowserSourceType(sessionKind, preferences)");
    expect(source).toContain('chooseSourceType("audio")');
    expect(source).toContain('chooseSourceType("video")');
    expect(source).toContain("chooseHeadphonesAttestation(event.target.checked)");
  });
});
