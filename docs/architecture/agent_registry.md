# Agent Registry: The AI Subsystem Map

The High Ground Studio ecosystem utilizes autonomous and semi-autonomous AI Agents to handle background tasks, UI automation, and testing. This registry tracks where these agents live and what they do.

## 1. UI Automation Agents
These agents commandeer the local operating system to perform tasks that APIs cannot.

- **The Insta360 Studio Agent** (`apps/local-engine/scripts/insta360-agent.py`)
  - **Role:** Commandeers the macOS mouse and keyboard to manually open Insta360 Studio, import `.insv` packages, and export optically perfect `.mp4` master files.
  - **Trigger:** Fired by the `RenderService` daemon when an EDL requires 360 master generation.

## 2. Background Research & Content Bots
*(Note: These were scaffolded in previous sprints but are currently waiting for the Agent Control Center UI to manage them).*
- **News Pipeline Architect** 
  - **Role:** Monitors 10 niche RSS feeds and uses the Gemini API to write daily Markdown articles in the style of Malcolm Gladwell.
- **Fumadocs Content Creator**
  - **Role:** Generates multi-page course modules (MDX) for the Niche Hubs (e.g., Leadership, Photography).

## 3. QA & Testing Agents
Found in `scripts/agentic-*`. These bots run end-to-end tests to ensure the platform doesn't break during refactors.
- **Agentic Studio Collaboration Smoke Test** (`scripts/agentic-studio-collab-lab-smoke.mjs`)
- **Agentic HGO Projection Smoke Test** (`scripts/agentic-hgo-projection-browser-smoke.mjs`)
- **Visual Smoke Test** (`scripts/agentic-hgo-projection-visual-smoke.mjs`)
