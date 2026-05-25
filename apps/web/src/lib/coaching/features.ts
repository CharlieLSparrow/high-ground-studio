export type CoachingFeatureCatalogItem = {
  featureKey: string;
  title: string;
  category: string;
  clientSummary: string;
  coachSummary: string;
  sortOrder: number;
};

export const COACHING_FEATURE_CATALOG: CoachingFeatureCatalogItem[] = [
  {
    featureKey: "session_prep",
    title: "Session Prep",
    category: "coaching_rhythm",
    clientSummary:
      "A short prompt set to help the client name what matters before the next session.",
    coachSummary:
      "Use before sessions when a client benefits from arriving with a focused topic.",
    sortOrder: 10,
  },
  {
    featureKey: "weekly_commitments",
    title: "Weekly Commitments",
    category: "accountability",
    clientSummary:
      "A lightweight place to track one to three commitments between sessions.",
    coachSummary:
      "Use for clients who need action clarity and follow-through more than more notes.",
    sortOrder: 20,
  },
  {
    featureKey: "reflection_journal",
    title: "Reflection Journal",
    category: "reflection",
    clientSummary:
      "Private reflection prompts for noticing patterns, wins, setbacks, and questions.",
    coachSummary:
      "Use when a client needs more self-observation between conversations.",
    sortOrder: 30,
  },
  {
    featureKey: "values_scorecard",
    title: "Values Scorecard",
    category: "alignment",
    clientSummary:
      "A simple self-check for whether recent choices match the values the client is practicing.",
    coachSummary:
      "Use for values, leadership identity, decision-making, and integrity work.",
    sortOrder: 40,
  },
  {
    featureKey: "milestone_tracker",
    title: "Milestone Tracker",
    category: "progress",
    clientSummary:
      "A visible path for goals, milestones, current blockers, and completed steps.",
    coachSummary:
      "Use when the coaching arc needs a concrete progress map instead of loose conversation history.",
    sortOrder: 50,
  },
  {
    featureKey: "resource_library",
    title: "Resource Library",
    category: "resources",
    clientSummary:
      "Curated readings, podcast episodes, exercises, and notes chosen for the client's current work.",
    coachSummary:
      "Use for clients who need targeted homework or follow-up materials.",
    sortOrder: 60,
  },
  {
    featureKey: "post_session_actions",
    title: "Post-Session Actions",
    category: "accountability",
    clientSummary:
      "A recap-oriented action list for what the client agreed to practice after a session.",
    coachSummary:
      "Use as the bridge from appointment notes to client-visible follow-through.",
    sortOrder: 70,
  },
  {
    featureKey: "between_session_checkins",
    title: "Between-Session Check-ins",
    category: "support",
    clientSummary:
      "A structured way to send short updates, questions, or progress notes between sessions.",
    coachSummary:
      "Use sparingly for higher-touch clients or short coaching seasons that need momentum.",
    sortOrder: 80,
  },
];

export function isClientVisibleCoachingFeatureGrant({
  status,
  visibility,
  startsAt,
  endsAt,
  now = new Date(),
}: {
  status: string;
  visibility: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  now?: Date;
}) {
  if (status !== "enabled") {
    return false;
  }

  if (visibility !== "client_and_coach") {
    return false;
  }

  if (startsAt && startsAt > now) {
    return false;
  }

  if (endsAt && endsAt < now) {
    return false;
  }

  return true;
}

