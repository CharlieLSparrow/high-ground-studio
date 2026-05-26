import { Feather, Sparkles } from "lucide-react";
import type { QuipslyState } from "@high-ground/quipsly-domain";

const stateCopy: Record<QuipslyState, string> = {
  idle: "Watching the archive shelf for useful trails.",
  curious: "Sniffing out themes, variants, and source paths.",
  found: "A source clue surfaced. Time to open the Passport.",
  thinking: "Comparing wording, context, and confidence.",
  saving: "Tucking this one into the Nest.",
  writing: "Drafting a curator note for the collection.",
  nesting: "Arranging saved quotes into a useful order.",
  celebrating: "A clean source trail deserves a little sparkle.",
  oops: "Something needs review before it becomes a claim.",
};

export function QuipslyPanel({
  state = "curious",
  note,
}: {
  readonly state?: QuipslyState;
  readonly note?: string;
}) {
  return (
    <section className="panel quipsly-panel" aria-label="Quipsly companion">
      <div className="section-label">
        <Feather size={14} aria-hidden="true" />
        Quipsly
      </div>
      <div className="quipsly-image-frame" aria-hidden="true">
        <img
          alt=""
          src="/illustrations/quipsly-character-states-brainstorm.png"
        />
      </div>
      <h2 className="panel-title">{stateCopy[state]}</h2>
      <p className="panel-copy">
        {note ??
          "The mascot layer can be charming, but every card still carries source and review state."}
      </p>
      <div className="chip-row" style={{ marginTop: "0.8rem" }}>
        <span className="chip">
          <Sparkles size={14} aria-hidden="true" />
          Cozy surface
        </span>
        <span className="chip">Serious archive</span>
      </div>
    </section>
  );
}
