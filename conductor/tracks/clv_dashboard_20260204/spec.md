# Specification: CLV Performance Dashboard

## Overview
Professional handicappers distinguish themselves by generating positive Closing Line Value (CLV). This track implements an analytics layer that compares the price taken on a bet against the final "Sharp" market price (Pinnacle closing lines) to calculate beat rates and Expected ROI (xROI).

**PHILOSOPHY:** Focus on **Sharp Market Truth**. Metrics are calculated exclusively against Pinnacle closing prices to ensure the highest standard of validation.

## User Stories
- **As a User**, I want to see my "CLV Beat %" to know if my entry points are consistently better than the market's final price.
- **As a User**, I want to see an "Expected ROI" (xROI) based on my CLV, helping me separate my process quality from short-term betting results.
- **As a User**, I want to visualize my CLV trend over time to confirm my edge is widening.

## Functional Requirements
1. **Closing Price Tracking:** Update the `Bet` model to store `closing_odds_sharp`.
2. **CLV Math Engine:** Utilities to calculate the percentage edge generated at closing (taken price vs no-vig closing price).
3. **xROI Calculation:** Logic to compute theoretical profit based on closing edges.
4. **Alpha Visualization:** A new dashboard section in the Tracker featuring:
    - **Total Beat Rate:** Global percentage of bets that beat the close.
    - **Alpha Chart:** A line chart showing CLV % movement over time.
    - **xROI vs actual ROI:** A comparison card to detect "bad luck" vs "bad process."

## Technical Details
- **Utilities:** Create `utils/clvUtils.ts`.
- **UI:** New `components/tracker/CLVDashboard.tsx` component.
- **Charts:** Leverage `recharts` for the trend visualization.
