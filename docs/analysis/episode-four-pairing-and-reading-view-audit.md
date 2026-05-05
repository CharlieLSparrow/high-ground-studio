# Episode Four Pairing and Reading View Audit

This document audits the block pairings for "Episode 4: The Early Days" of the *Learning to Lead* podcast arrangement and outlines the expected behavior of the Episode Reading View.

## Arrangement and Pairings

The episode is constructed from the following blocks, in order, as defined in `podcast-season-1.yml`. Each pairing consists of a primary Homer block and a responding Charlie block.

1.  **Homer Block:** `homer-early-days-preschool-memories`
    -   **Paired Charlie Block:** `charlie-early-days-effort-and-joy-sidebar`

2.  **Homer Block:** `homer-early-days-first-grade-name-calling`
    -   **Paired Charlie Block:** `charlie-early-days-psychological-safety-sidebar`

3.  **Homer Block:** `homer-early-days-second-grade-quiet-time`
    -   **Paired Charlie Block:** `charlie-early-days-incentives-sidebar`

4.  **Homer Block:** `homer-early-days-third-grade-busy-work`
    -   **Paired Charlie Block:** `charlie-early-days-autonomy-and-purpose-sidebar`

5.  **Homer Block:** `homer-early-days-seventh-grade-keyboarding`
    -   **Paired Charlie Block:** `charlie-early-days-start-with-why-sidebar`

6.  **Homer Block:** `homer-early-days-farm-years`
    -   **Paired Charlie Block:** `charlie-early-days-meaning-and-endurance-sidebar`

7.  **Homer Block:** `homer-values-simple-solutions`
    -   **Paired Charlie Block:** `charlie-early-days-listening-culture-sidebar`

8.  **Unpaired Charlie Block:** `charlie-early-days-warmth-and-attention-close`
    -   This block serves as an episode closer and has no `pairsWith` target.

## Expected Reading View Behavior

When "Episode Reading" mode is active in the Living Manuscript Viewer:

-   The seven Homer blocks listed above will render as full-width primary manuscript cards.
-   Each of the seven corresponding Charlie blocks will render as a visually distinct "aside" or "margin note" attached to its paired Homer block. The layout should place the Charlie block to the side on wider viewports and stack it on mobile.
-   The final `charlie-early-days-warmth-and-attention-close` block, being unpaired, will render as a full-width card at the very end of the episode's content, following the final Homer/Charlie pair.
-   The visual order of the content must follow the sequence defined in the arrangement file.
