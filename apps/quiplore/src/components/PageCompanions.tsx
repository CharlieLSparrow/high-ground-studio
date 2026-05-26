import { pageCompanions } from "@high-ground/quipsly-domain/seed";

import { createQuipSpriteStyle } from "./QuipVisual";

export function PageCompanions() {
  return (
    <div className="page-companion-field" aria-hidden="true">
      {pageCompanions.map((companion) => (
        <span
          className={`page-companion ${companion.placement}`}
          key={companion.id}
          style={createQuipSpriteStyle(companion)}
        />
      ))}
    </div>
  );
}
