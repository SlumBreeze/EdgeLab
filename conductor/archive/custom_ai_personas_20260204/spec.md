# Specification: Custom AI Personas

## Overview
EdgeLab v3 requires a sophisticated interface for advanced users (Professional Handicappers and Data Scientists) to customize the "Stoic Handicapper" agent. This customization allows the agent to align with the user's specific risk profile, mathematical edge requirements, and sport-specific focus.

**CRITICAL PHILOSOPHY:** Per the product guidelines, this system must prioritize **Action and Volume**. The AI should identify the "Relative Value" in every game rather than using a binary "Perfect or Pass" filter.

## User Stories
- **As a Professional Handicapper**, I want to maximize my volume by having the AI identify the best side in every game, even if the edge is thin.
- **As a Data Scientist**, I want to adjust the "Edge Threshold" (e.g., to 0.1%) so the AI only recommends plays where a mathematical advantage exists, however small.
- **As a User**, I want to enable "Volume Mode" to ensure I have a daily card full of actionable plays.

## Functional Requirements
1. **Configuration Persistence:** Save persona settings to Supabase (linked to `user_id`).
2. **Dynamic Logic Integration:** The `geminiService.ts` and veto logic must respect the active persona's parameters.
3. **Bloomberg-Terminal UI:** Minimalist, data-dense interface for editing parameters.
4. **Parameter Validation:** Ensure settings are within logical bounds.

## Technical Details
- **Settings Storage:** New `user_personas` table in Supabase or an extension to the `profiles` table.
- **Core Parameters:**
    - `min_edge_percentage` (default **0.1**)
    - `volume_mode` (default: **High Action** - prioritize ranking every game)
    - `max_odds_american` (default -175)
    - `risk_tolerance` (Conservative, Balanced, Aggressive)
    - `active_sports` (List of sport keys)
- **UI Components:**
    - `PersonaEditor`: Main configuration view.
    - `ParameterInput`: Individual setting components for precise data entry.
