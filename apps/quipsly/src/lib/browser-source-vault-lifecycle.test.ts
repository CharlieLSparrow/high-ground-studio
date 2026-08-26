import fs from "node:fs";
import path from "node:path";

describe("browser source vault database lifecycle", () => {
  it("releases current connections for upgrades and fails blocked legacy opens visibly", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/browser-source-vault.ts"),
      "utf8",
    );

    expect(source).toContain("opened.onversionchange = () => {");
    expect(source).toContain("opened.close()");
    expect(source).toContain("if (databasePromise === opening) databasePromise = null");
    expect(source).toContain("request.onblocked = () =>");
    expect(source).toContain(
      "Recording storage is waiting on another older Quipsly tab.",
    );
    expect(source).toContain("if (settled) {");
    expect(source).toContain("transaction.oncomplete = () => {");
    expect(source).toContain("if (!requestSucceeded) {");
    expect(source).toContain("resolve(result)");
    expect(source).toContain("transaction.onabort = () =>");
    expect(source).not.toContain(
      "request.onsuccess = () => resolve(request.result)",
    );
  });
});
