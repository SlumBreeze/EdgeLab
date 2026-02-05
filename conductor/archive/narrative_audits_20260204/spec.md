# Specification: Enhanced Narrative Audits

## Overview
EdgeLab v3 needs to move beyond purely mathematical vetoes to identify "Trap" scenarios. This track implements a multi-stage qualitative audit that cross-references public betting trends, reverse line movement, and social sentiment from beat writers and experts.

**PHILOSOPHY:** Narrative Audit failures result in **Warnings**, not Hard Vetoes. The user sees the play but is alerted to specific contextual risks.

## User Stories
- **As a User**, I want to know if I'm betting on a "Public Darling" where the sharps are on the other side.
- **As a User**, I want to see sentiment from beat writers and experts integrated into the AI's reasoning.
- **As a User**, I want a high-visibility "TRAP ALERT" warning on my card if the situational context contradicts the math.

## Functional Requirements
1. **Reverse Line Movement (RLM) Detection:** Logic to detect when >75% of public tickets are on one side but the line is moving toward the other side.
2. **Social Sentiment Search:** The `quickScanGame` and `analyzeGame` prompts must explicitly use Google Search to find expert consensus and beat writer reports.
3. **Trap Detection Engine:** A new AI sub-routine that evaluates the "Public Darling" and "Expert Sentiment" factors.
4. **Warning UI:** High-contrast, Bloomberg-style alert components for "Trap Alerts."

## Technical Details
- **Trigger:** Integrated into the `analyzeGame` flow in `geminiService.ts`.
- **Search Tooling:** Enhanced use of `googleSearch` tool in Gemini Pro prompts.
- **UI Integration:** Update `QueuedGameCard` and the daily `Card` view to display "Trap Alerts."
