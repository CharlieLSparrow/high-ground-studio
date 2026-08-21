import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("browser retained-source consent", () => {
  it("uses one explicit agreement while keeping transcription independently adjustable", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "const [transcriptionAllowed, setTranscriptionAllowed] = useState(true);",
    );
    expect(source).toContain("transcriptionAllowedRef.current = allowed;");
    expect(source).toContain(
      "transcriptionChoiceInputRef.current?.checked",
    );
    expect(source).toContain("canTranscribe: submittedTranscriptionChoice");
    expect(source).toMatch(
      /ref=\{transcriptionChoiceInputRef\}\s+type="checkbox"\s+checked=\{transcriptionAllowed\}/,
    );
    expect(source).toContain('"Agree and continue"');
    expect(source).toContain("Create a transcript and suggested notes/tasks");
    expect(source).toContain("conversationConnected = true");
    expect(source).toContain('className={conversationConnected ? "" : "hidden"}');
    expect(source).toContain("the Record button appears after you join");
    expect(source).not.toContain("Save my consent receipt");
  });
});
