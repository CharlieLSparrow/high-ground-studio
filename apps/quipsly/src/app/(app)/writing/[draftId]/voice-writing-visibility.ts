export type WritingVisibility = "personal" | "nest";

export type WritingDestinationVisibility = {
  isHome: boolean;
};

export function voiceWritingMoveVisibility(
  destination: WritingDestinationVisibility,
): WritingVisibility {
  return destination.isHome ? "personal" : "nest";
}

export function voiceWritingAudience(visibility: WritingVisibility) {
  if (visibility === "nest") {
    return {
      eyebrow: "Shared writing",
      label: "Nest members",
      description: "Nest members can open and edit this writing.",
      action: "Make visible only to me",
    } as const;
  }
  return {
    eyebrow: "Only you",
    label: "Only you",
    description: "Only you can open this writing.",
    action: "Share with Nest members",
  } as const;
}

export const voiceWritingSourceBoundary =
  "Your connected recording remains yours unless you share it separately.";
