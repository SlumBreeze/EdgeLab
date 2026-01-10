import type { Fact, InjuryFact, Sport } from '../types.ts';

export interface ValidationInput {
  narrativeAnalysis: string;
  factsUsed: Fact[];
  injuries: InjuryFact[];
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  sport: Sport;
  lineValueCents?: number;
  hasVerifiedAvailabilityMismatch?: boolean;
}

export interface ValidationResult {
  vetoTriggered: boolean;
  vetoReason?: string;
  dominanceRatio: number;
  adjustedConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  factConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const injuryKeywordPattern = /\b(injury|injured|out|questionable|probable|doubtful|inactive)\b/i;
const statPattern = /\b(\d{1,3}(?:\.\d+)?)\s*(pts|points|rebounds|reb|assists|ast|yards|yds|tds|touchdowns|goals|shots|saves|blocks|steals)\b/i;
const scorePattern = /\b\d{2,3}\s*-\s*\d{2,3}\b/;
const rosterChangePattern = /\b(trade|traded|waived|released|signed|signing|cut|promoted|demoted|benching|benched|role change|starting role)\b/i;

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(token => token.length >= 2);

const countFactMentions = (factsUsed: Fact[], narrativeTokens: Set<string>) => {
  let mentions = 0;
  factsUsed.forEach(fact => {
    const tokens = tokenize(fact.claim).filter(t => t.length >= 3);
    const uniqueTokens = new Set(tokens);
    const matched = Array.from(uniqueTokens).some(token => narrativeTokens.has(token));
    if (matched) mentions += 1;
  });
  return mentions;
};

const getDominanceThresholds = (sport: Sport) => {
  const defaults = { ok: 0.45, warn: 0.30 };
  const overrides: Partial<Record<Sport, { ok: number; warn: number }>> = {};
  return overrides[sport] || defaults;
};

const hasUnverifiedFacts = (factsUsed: Fact[]) =>
  factsUsed.some(fact => fact.confidence !== 'HIGH');

const hasBoxScoreSupport = (factsUsed: Fact[]) =>
  factsUsed.some(fact => fact.source_type === 'BOX_SCORE' && fact.confidence === 'HIGH');

const hasRosterChangeSupport = (factsUsed: Fact[]) =>
  factsUsed.some(
    fact =>
      fact.confidence === 'HIGH' &&
      rosterChangePattern.test(fact.claim)
  );

export const hasVerifiedAvailabilityMismatch = (factsUsed: Fact[], injuries: InjuryFact[]) => {
  const hasOutInjury = injuries.some(injury => injury.status === 'OUT');
  const hasOutFact =
    factsUsed.some(
      fact =>
        fact.source_type === 'NBA_INJURY_REPORT' &&
        fact.confidence === 'HIGH' &&
        /\bout\b|\bruled out\b|\binactive\b/i.test(fact.claim)
    );
  return hasOutInjury || hasOutFact;
};

export const validateAnalysis = (input: ValidationInput): ValidationResult => {
  const narrative = input.narrativeAnalysis || '';
  const narrativeTokenList = tokenize(narrative);
  const narrativeTokens = new Set(narrativeTokenList);
  const tokenCount = narrativeTokenList.length;

  const factMentions = countFactMentions(input.factsUsed, narrativeTokens);
  const dominanceRatio = tokenCount > 0 ? factMentions / tokenCount : 0;
  const thresholds = getDominanceThresholds(input.sport);

  if (hasUnverifiedFacts(input.factsUsed)) {
    return {
      vetoTriggered: true,
      vetoReason: 'UNVERIFIED_FACT_DEPENDENCY',
      dominanceRatio,
      adjustedConfidence: input.confidence || 'MEDIUM',
      factConfidence: 'LOW'
    };
  }

  const noInjuryDataNoted = /no verified injury|data not provided/i.test(narrative);
  if (injuryKeywordPattern.test(narrative) && input.injuries.length === 0 && !noInjuryDataNoted) {
    return {
      vetoTriggered: true,
      vetoReason: 'INJURY_TEXT_NOT_STRUCTURED',
      dominanceRatio,
      adjustedConfidence: input.confidence || 'MEDIUM',
      factConfidence: 'LOW'
    };
  }

  if (!hasBoxScoreSupport(input.factsUsed) && (statPattern.test(narrative) || scorePattern.test(narrative))) {
    return {
      vetoTriggered: true,
      vetoReason: 'UNVERIFIED_HISTORICAL_CLAIM',
      dominanceRatio,
      adjustedConfidence: input.confidence || 'MEDIUM',
      factConfidence: 'LOW'
    };
  }

  if (!hasRosterChangeSupport(input.factsUsed) && rosterChangePattern.test(narrative)) {
    return {
      vetoTriggered: true,
      vetoReason: 'UNVERIFIED_HISTORICAL_CLAIM',
      dominanceRatio,
      adjustedConfidence: input.confidence || 'MEDIUM',
      factConfidence: 'LOW'
    };
  }

  if (dominanceRatio < thresholds.warn) {
    return {
      vetoTriggered: true,
      vetoReason: 'NARRATIVE_DOMINANCE',
      dominanceRatio,
      adjustedConfidence: input.confidence || 'MEDIUM',
      factConfidence: 'LOW'
    };
  }

  let adjustedConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = input.confidence || 'MEDIUM';
  if (dominanceRatio < thresholds.ok && adjustedConfidence === 'HIGH') {
    adjustedConfidence = 'MEDIUM';
  }
  const factConfidence =
    input.factsUsed.length === 0 ? 'LOW' :
    dominanceRatio < thresholds.ok ? 'MEDIUM' :
    'HIGH';

  if (
    typeof input.lineValueCents === 'number' &&
    input.lineValueCents < 8 &&
    !(input.lineValueCents >= 5 && input.hasVerifiedAvailabilityMismatch)
  ) {
    return {
      vetoTriggered: true,
      vetoReason: 'INSUFFICIENT_MARGIN',
      dominanceRatio,
      adjustedConfidence,
      factConfidence
    };
  }

  return {
    vetoTriggered: false,
    vetoReason: undefined,
    dominanceRatio,
    adjustedConfidence,
    factConfidence
  };
};
