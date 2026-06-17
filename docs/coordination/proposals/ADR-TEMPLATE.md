# ADR Template: [Short Title of Proposed Decision]

**Date:** YYYY-MM-DD
**Lane:** AG-[Your-Lane-Name]
**Status:** Proposed | Accepted | Rejected | Superseded

## 1. Context & Problem
What is the current state? Why does the existing schema, architecture, or routing fall short for the required feature? Be concise but clear about the exact blockage.

## 2. Options Considered
List the architectural options or schema models you considered before arriving at the proposed decision.
*   **Option A:** [Description] - Pros / Cons
*   **Option B:** [Description] - Pros / Cons

## 3. Proposed Decision
What is the exact technical change you want to implement? 
*   **Schema changes:** Include a snippet of the proposed `schema.prisma` edits.
*   **Route changes:** List the exact new routes or deleted routes.
*   **API/Package changes:** List any shared infrastructure changes.

## 4. Consequences & Rollback
*   **Positive:** [e.g., Unblocks the feature, improves performance.]
*   **Negative:** [e.g., Requires a database migration, breaks old clients temporarily.]
*   **Rollback Plan:** How do we revert this safely if it causes a production incident?

---
*Note: Once this file is created, append **SCHEMA AUTHORITY REQUIRED** to your daily lane report and link to this file. Then pivot immediately to building your frontend against mock data until Codex approves.*
