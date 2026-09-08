/** Canonical tag colors are opaque RGB, never arbitrary CSS. An absent/legacy
 * value uses the normal theme rather than inventing a different tag color. */
export function tagChipColors(value: string | null | undefined) {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return undefined;
  const hex = value.length === 4 ? `#${[...value.slice(1)].map(char => char + char).join("")}` : value;
  const channels = [1, 3, 5].map(offset => {
    const component = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  // Choose whichever opaque text has higher WCAG contrast. Every RGB fill
  // supports at least 4.5:1 against one of these two foreground colors.
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return { backgroundColor: hex.toLowerCase(), borderColor: hex.toLowerCase(),
    color: blackContrast >= whiteContrast ? "#000000" : "#ffffff" };
}
