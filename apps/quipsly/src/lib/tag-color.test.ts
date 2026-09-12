import { tagChipColors } from "./tag-color";

test.each([null, undefined, "", "red", "#12345", "#123456ff", "var(--x)", "#fff;opacity:0"])(
  "invalid or unset color %s falls back to the theme", value => {
    expect(tagChipColors(value)).toBeUndefined();
  },
);
test("expands shorthand without changing the selected color", () => {
  expect(tagChipColors("#Fa0")).toEqual({ backgroundColor: "#ffaa00", borderColor: "#ffaa00", color: "#000000" });
});
test("chosen text meets 4.5:1 across a representative RGB grid, including middle luminance", () => {
  // Independent test calculation: compare actual selected text to each fill.
  const linear = (byte: number) => byte / 255 <= 0.04045 ? byte / 255 / 12.92 : Math.pow((byte / 255 + 0.055) / 1.055, 2.4);
  const samples = [0, 16, 32, 64, 96, 112, 128, 144, 160, 192, 224, 255];
  for (const r of samples) for (const g of samples) for (const b of samples) {
    const hex = "#" + [r, g, b].map(value => value.toString(16).padStart(2, "0")).join("");
    const foreground = tagChipColors(hex)!.color === "#ffffff" ? 1 : 0;
    const background = linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722;
    expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
