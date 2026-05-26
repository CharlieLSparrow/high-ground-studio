import type {
  QuipVisualCell,
  QuipVisualGridColumns,
  QuipVisualGridRows,
  QuoteVisualProjection,
} from "@high-ground/quipsly-domain";
import type { CSSProperties } from "react";

type SpriteStyle = CSSProperties & {
  "--quip-visual-image": string;
  "--quip-visual-position": string;
  "--quip-visual-size": string;
};

const horizontalPositions: Record<
  QuipVisualGridColumns,
  Record<QuipVisualCell, string>
> = {
  3: {
    "top-left": "0%",
    "top-center": "50%",
    "top-center-left": "50%",
    "top-center-right": "50%",
    "top-right": "100%",
    "bottom-left": "0%",
    "bottom-center": "50%",
    "bottom-center-left": "50%",
    "bottom-center-right": "50%",
    "bottom-right": "100%",
  },
  4: {
    "top-left": "0%",
    "top-center": "33.333%",
    "top-center-left": "33.333%",
    "top-center-right": "66.667%",
    "top-right": "100%",
    "bottom-left": "0%",
    "bottom-center": "33.333%",
    "bottom-center-left": "33.333%",
    "bottom-center-right": "66.667%",
    "bottom-right": "100%",
  },
};

function getSpritePosition(
  spriteCell: QuipVisualCell,
  spriteColumns: QuipVisualGridColumns,
): string {
  const x = horizontalPositions[spriteColumns][spriteCell];
  const y = spriteCell.startsWith("bottom") ? "100%" : "0%";

  return `${x} ${y}`;
}

export function createQuipSpriteStyle({
  assetSrc,
  spriteCell,
  spriteColumns = 3,
  spriteRows = 2,
}: {
  readonly assetSrc: string;
  readonly spriteCell: QuipVisualCell;
  readonly spriteColumns?: QuipVisualGridColumns;
  readonly spriteRows?: QuipVisualGridRows;
}): SpriteStyle {
  return {
    "--quip-visual-image": `url(${assetSrc})`,
    "--quip-visual-position": getSpritePosition(spriteCell, spriteColumns),
    "--quip-visual-size": `${spriteColumns * 100}% ${spriteRows * 100}%`,
  };
}

export function QuipVisual({
  visual,
  size = "card",
}: {
  readonly visual?: QuoteVisualProjection;
  readonly size?: "card" | "stream" | "hero";
}) {
  if (!visual) {
    return null;
  }

  return (
    <figure
      aria-label={visual.alt}
      className={`quote-visual ${size}`}
      role="img"
      style={createQuipSpriteStyle(visual)}
    >
      <figcaption>
        <strong>{visual.mood}</strong>
        <span>{visual.caption}</span>
      </figcaption>
    </figure>
  );
}
