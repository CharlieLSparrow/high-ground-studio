# Quipsly Storyboard Engine

Welcome to the **Quipsly Storyboard Engine**. This module is designed to provide a highly professional, cinematic storyboarding experience right within the Quipsly workspace. It seamlessly bridges the gap between text-based ideation and production reality for video editors, animators, and directors.

## 🏗 Architecture & Design Philosophy

The storyboard engine is built on robust, modern React patterns and follows strict server-side action validation.

### Core Components
- **`StoryboardApp.tsx`**: The main orchestration component. It fetches the project's sequence, provisions an empty state if none exists, and sets up the Drag-and-Drop (`dnd-kit`) context for reordering frames smoothly.
- **`FrameCard.tsx`**: A highly interactive, accessible representation of a single storyboard frame. Features full inline-editing, optimistic UI updates via `useTransition`, and real-time syncing.
- **`FrameInspector.tsx`**: A detailed slide-out panel for nuanced frame adjustments (VFX notes, estimated duration, lens specs). Ensures the main sequence view stays uncluttered while offering pro-level metadata controls.
- **`ArtistAssistantChat.tsx`**: The Quipsly Co-Pilot! This component invokes an autonomous agent to break down prose manuscripts into a structured, cinematic shot list.

### 🛡 State Management & Optimistic UI
We heavily rely on React's `useTransition` for mutating state. When a user drags a frame or updates dialogue, the UI updates instantly while the server action (`actions.ts`) fires in the background. If the server action fails, the UI gracefully rolls back, ensuring maximum resilience.

### ♿ Accessibility (a11y)
Professional tools must be usable by everyone.
- Full keyboard navigation (Tab-indexing, Enter to save, Esc to cancel).
- ARIA labels on all icon-only buttons.
- Distinct `focus-visible` rings so power users can navigate the sequence entirely via keyboard without getting lost.
- High-contrast text palettes specifically tuned for the 'Studio Dark' aesthetics.

### 📡 Server Actions (`actions.ts`)
All database operations are encapsulated in `actions.ts`. We use strict `ActionResponse` envelopes to guarantee that the client always receives a standardized payload containing `success`, `data`, or a safe `error` message. This prevents hard crashes in the Next.js routing layer.

---
*Built with care, precision, and Golden Retriever librarian energy.*
