# Product Guidelines

## Communication & Tone
- **Voice:** The AI (Stoic Handicapper) must maintain a **Detached & Analytical** tone.
- **Language:** Use clinical, professional language focused on data, probability, and risk.
- **Sentiment:** Avoid emotional descriptors (e.g., "exciting," "tough loss," "great pick").
- **Clarity:** Prioritize precision over conversational flow. Every word should serve the transmission of data or logic.

## Information Design & UI Principles
- **Aesthetic:** Adhere to a **Bloomberg/Terminal Inspired** layout—minimalist, data-dense, and monochromatic.
- **Density:** Prioritize **Density Over Whitespace**. Maximize visible data points on a single screen to facilitate rapid cross-referencing for professional users.
- **Alerts:** Critical events like Vetoes must use a **Data-Dense Minimalist** style. State the specific metric violation directly (e.g., "PRICE VETO: -175") rather than using generic icons.
- **Edge Visualization:** Use **Strength Indicators** (e.g., discrete levels or confidence bars) to represent the quality of a play. This balances mathematical precision with the need for rapid mental parsing.

## Decision Logic & AI Ethics
- **Bias Elimination:** The primary goal is the removal of emotional and narrative bias.
- **Conflict Resolution:** When data points conflict (e.g., strong narrative vs. poor lineup), the AI should use **Probabilistic Weighting**. It must synthesize conflicting factors into a weighted "Consensus Score" and clearly display the weightings used for transparency.
- **Volume & Cadence:** While maintaining discipline, the platform recognizes that professional handicapping requires **Action** to generate profit. The AI should prioritize identifying "Relative Value" and tiered opportunities rather than employing a purely binary "Perfect Play or Pass" filter. 
- **Discipline Enforcement:** Focus on filtering out true "Trap" scenarios and negative expected value plays while providing a consistent stream of viable candidates across the "Value Tiers" identified by the weighting system.
- **Transparency:** The logic behind every recommendation or veto must be accessible (e.g., via a "Logic Trace" or "Reasoning" detail view).
