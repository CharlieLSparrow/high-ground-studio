import { jsonOk, streamModes } from "@/lib/api";

const modeLabels: Record<(typeof streamModes)[number], string> = {
  "for-you": "For You",
  verified: "Verified",
  "by-theme": "By Theme",
  "by-person": "By Person",
  "by-source": "By Source",
  "lorelist-builder": "Lorelist Builder",
  "story-trail": "Story Trail",
  "newly-reviewed": "Newly Reviewed",
  "curator-picks": "Curator Picks",
};

export function GET() {
  return jsonOk(
    streamModes.map((mode) => ({
      id: mode,
      label: modeLabels[mode],
    })),
  );
}
