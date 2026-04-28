# Layout Lab Visual QA Result

Date: 2026-04-28

What was reviewed:
- `/`
- `/coaching`
- `/library`
- `/episodes/write-it-down`
- each route was inspected under:
  - `cinematic`
  - `editorial`
  - `signal`

How the review was done:
- ran the app locally with a team-capable session cookie so the server would honor the `hgo_layout_variant` cookie
- captured screenshots for the target route/variant combinations
- reviewed the rendered pages for spacing, contrast, readability, and variant fit

Key findings:
- `/`, `/coaching`, and `/library` all render and are visually reviewable across the three variants
- the representative `/episodes/*` route is currently blocked by the guarded Fumadocs loader path
- with `ENABLE_EPISODES_FUMADOCS=1`, both `next dev` and `next start` reproduced:
  - `ERR_UNSUPPORTED_ESM_URL_SCHEME`
  - protocol `fumadocs-mdx:`
- that makes `/episodes/*` a runtime QA blocker rather than a layout-polish target right now
- the episode runtime failure should be handled as a separate future investigation, not as part of this layout-lab visual QA pass
- screenshots stayed local to the QA session and were not added to the repo

Highest-value polish opportunities identified:
1. fix the current `/episodes/*` loader/runtime blocker
2. reduce oversized hero whitespace on the home page in `cinematic` and `editorial`
3. replace or remove the empty black archive media wells on the home archive cards
4. tighten the coaching hero text measure across all three variants
5. improve subtle panel separation in lighter `signal` and `editorial` browse surfaces where needed

Artifacts created in this pass:
- `docs/analysis/layout-lab-visual-qa.md`
- `docs/sessions/layout-lab-visual-qa-plan.md`
- `docs/sessions/layout-lab-visual-qa-result.md`
