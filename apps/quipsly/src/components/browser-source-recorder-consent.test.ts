import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("browser retained-source consent", () => {
  it("requires an affirmative transcription choice on every fresh recorder", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/browser-source-recorder.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "const [transcriptionAllowed, setTranscriptionAllowed] = useState(false);",
    );
    expect(source).not.toContain(
      "const [transcriptionAllowed, setTranscriptionAllowed] = useState(true);",
    );
  });
});
