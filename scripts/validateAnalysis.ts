import { validateAnalysis, hasVerifiedAvailabilityMismatch } from '../utils/analysisValidator.ts';
import type { Fact, InjuryFact } from '../types.ts';

const runCase = (label: string, input: {
  narrativeAnalysis: string;
  factsUsed: Fact[];
  injuries: InjuryFact[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  lineValueCents: number;
}) => {
  const availabilityMismatch = hasVerifiedAvailabilityMismatch(input.factsUsed, input.injuries);
  const result = validateAnalysis({
    narrativeAnalysis: input.narrativeAnalysis,
    factsUsed: input.factsUsed,
    injuries: input.injuries,
    confidence: input.confidence,
    sport: 'NBA',
    lineValueCents: input.lineValueCents,
    hasVerifiedAvailabilityMismatch: availabilityMismatch
  });

  console.log(`\n[${label}]`);
  console.log(result);
};

const goodFacts: Fact[] = [
  {
    claim: 'Celtics list Kristaps Porzingis OUT on the NBA injury report',
    source_type: 'NBA_INJURY_REPORT',
    confidence: 'HIGH'
  },
  {
    claim: 'Pinnacle moved Boston from -4.5 to -5.5',
    source_type: 'ODDS_API',
    confidence: 'HIGH'
  }
];

const goodInjuries: InjuryFact[] = [
  { team: 'Boston Celtics', player: 'Kristaps Porzingis', status: 'OUT', source: 'NBA_INJURY_REPORT' }
];

runCase('GOOD: facts dominate, OUT injury, strong edge', {
  narrativeAnalysis: 'With Porzingis OUT per the injury report, Boston leans on smaller lineups that raise variance. The market move supports the sharper side.',
  factsUsed: goodFacts,
  injuries: goodInjuries,
  confidence: 'HIGH',
  lineValueCents: 9
});

runCase('BAD: hallucinated box score', {
  narrativeAnalysis: 'Porzingis scored 30 points last game, so the market is overreacting.',
  factsUsed: [],
  injuries: [],
  confidence: 'MEDIUM',
  lineValueCents: 12
});

runCase('BAD: weak edge without mismatch', {
  narrativeAnalysis: 'Market moved slightly but no verified availability changes were found.',
  factsUsed: [
    {
      claim: 'Pinnacle moved Boston from -4.5 to -5.0',
      source_type: 'ODDS_API',
      confidence: 'HIGH'
    }
  ],
  injuries: [],
  confidence: 'MEDIUM',
  lineValueCents: 5
});

console.log('\nTip: run with `node --experimental-strip-types scripts/validateAnalysis.ts`.');
