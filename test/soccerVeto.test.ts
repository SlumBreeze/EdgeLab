import { describe, it, expect } from 'vitest';
import { validateAnalysis, ValidationInput } from '../utils/analysisValidator';

describe('Soccer Veto Logic', () => {
  it('should downgrade confidence for Derby hype without tactical justification', () => {
    const input: ValidationInput = {
      sport: 'SOCCER',
      confidence: 'HIGH',
      narrativeAnalysis: "This is a massive Derby. Both teams are desperate and it's a must-win for the home side to stay in the title race. The rivalry is intense.",
      factsUsed: [
        { claim: "Arsenal vs Tottenham is a North London Derby", source_type: "ODDS_API", confidence: "HIGH" }
      ],
      injuries: [],
      lineValueCents: 15 // Good value
    };

    const result = validateAnalysis(input);
    
    // Should be downgraded to MEDIUM because of Derby/Must-win hype without tactical delta
    expect(result.adjustedConfidence).toBe('MEDIUM');
    expect(result.vetoTriggered).toBe(false); // Narrative audits don't auto-veto
  });

  it('should maintain HIGH confidence if tactical justification is provided', () => {
    const input: ValidationInput = {
      sport: 'SOCCER',
      confidence: 'HIGH',
      narrativeAnalysis: "This North London Derby is a must-win. However, the edge is justified by the return of Bukayo Saka to the starting XI, providing a massive tactical boost against a rotated Spurs backline.",
      factsUsed: [
        { claim: "Saka returning from injury", source_type: "ODDS_API", confidence: "HIGH" }
      ],
      injuries: [],
      lineValueCents: 15
    };

    const result = validateAnalysis(input);
    
    // Should stay HIGH because it has tactical justification ("starting XI", "injury")
    expect(result.adjustedConfidence).toBe('HIGH');
  });
});
