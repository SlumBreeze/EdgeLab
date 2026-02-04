# Implementation Plan: Custom AI Personas

## Phase 1: Data Model & Persistence
- [ ] Task: Update Database Schema
    - [ ] Write migration script for `user_personas` table or `profiles` update
    - [ ] Apply migration to Supabase
- [ ] Task: Create Persona Service
    - [ ] Write tests for fetching/saving persona settings
    - [ ] Implement `personaService.ts` to interact with Supabase
- [ ] Task: Conductor - User Manual Verification 'Data Model & Persistence' (Protocol in workflow.md)

## Phase 2: Core Logic Integration (Action-Oriented)
- [ ] Task: Update Veto System for Volume Mode
    - [ ] Write tests for `geminiService` ensuring it ranks sides even with thin edges
    - [ ] Refactor veto utils to respect `min_edge_percentage` (default 0.1%) and `volume_mode`
- [ ] Task: Update Kelly Criterion Calculation
    - [ ] Write tests for dynamic Kelly scaling based on persona `risk_tolerance`
    - [ ] Implement risk-adjusted stake calculation that supports high-volume betting
- [ ] Task: Conductor - User Manual Verification 'Core Logic Integration' (Protocol in workflow.md)

## Phase 3: Bloomberg-Terminal UI
- [ ] Task: Create Persona Editor Shell
    - [ ] Write tests for `PersonaEditor` component rendering
    - [ ] Implement the minimalist, data-dense layout for settings
- [ ] Task: Implement Individual Setting Components
    - [ ] Write tests for `ParameterInput` (validation, change handling)
    - [ ] Implement input components for odds, edge, and sport toggles
- [ ] Task: Connect UI to Persistence
    - [ ] Write integration tests for loading and saving settings from the UI
    - [ ] Connect `PersonaEditor` to `personaService`
- [ ] Task: Conductor - User Manual Verification 'Bloomberg-Terminal UI' (Protocol in workflow.md)
