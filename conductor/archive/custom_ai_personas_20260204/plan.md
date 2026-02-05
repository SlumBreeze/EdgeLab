# Implementation Plan: Custom AI Personas

## Phase 1: Data Model & Persistence [checkpoint: 16b85ba]
- [x] Task: Update Database Schema [f1346c2]
    - [x] Write migration script for `user_personas` table or `profiles` update
    - [x] Apply migration to Supabase
- [x] Task: Create Persona Service [3905b97]
    - [x] Write tests for fetching/saving persona settings
    - [x] Implement `personaService.ts` to interact with Supabase
- [ ] Task: Conductor - User Manual Verification 'Data Model & Persistence' (Protocol in workflow.md)

## Phase 2: Core Logic Integration (Action-Oriented)
- [x] Task: Update Veto System for Volume Mode [e2940ea]
    - [x] Write tests for `geminiService` ensuring it ranks sides even with thin edges
    - [x] Refactor veto utils to respect `min_edge_percentage` (default 0.1%) and `volume_mode`
- [x] Task: Update Kelly Criterion Calculation [f0f36a4]
    - [x] Write tests for dynamic Kelly scaling based on persona `risk_tolerance`
    - [x] Implement risk-adjusted stake calculation that supports high-volume betting
- [ ] Task: Conductor - User Manual Verification 'Core Logic Integration' (Protocol in workflow.md)

## Phase 2: Core Logic Integration (Action-Oriented) [checkpoint: f0f36a4]

## Phase 3: Bloomberg-Terminal UI
- [x] Task: Create Persona Editor Shell [c94a0a4]
    - [x] Write tests for `PersonaEditor` component rendering
    - [x] Implement the minimalist, data-dense layout for settings
- [x] Task: Implement Individual Setting Components [c94a0a4]
    - [x] Write tests for `ParameterInput` (validation, change handling)
    - [x] Implement input components for odds, edge, and sport toggles
- [x] Task: Connect UI to Persistence [c94a0a4]
    - [x] Write integration tests for loading and saving settings from the UI
    - [x] Connect `PersonaEditor` to `personaService`
- [ ] Task: Conductor - User Manual Verification 'Bloomberg-Terminal UI' (Protocol in workflow.md)

## Phase 3: Bloomberg-Terminal UI [checkpoint: beb9d47]
