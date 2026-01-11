
import { QueuedGame } from '../types';

// ============================================
// TYPES
// ============================================

export interface DiversificationWarning {
  type: 'SPORT' | 'MARKET' | 'DIRECTION' | 'TIME_SLOT';
  severity: 'INFO' | 'CAUTION' | 'WARNING';
  title: string;
  message: string;
  breakdown: string; // e.g., "NBA: 4, NFL: 1, NHL: 1"
}

export interface PLScenario {
  record: string;        // "6-0", "4-2", etc.
  wins: number;
  losses: number;
  netPL: number;         // Positive = profit, negative = loss
  isBreakEven: boolean;  // True if this is roughly the break-even point
  color: string;         // Tailwind color class for display
}

export interface CardAnalytics {
  diversificationWarnings: DiversificationWarning[];
  plScenarios: PLScenario[];
  totalWagered: number;
  maxProfit: number;
  maxLoss: number;
}

// ============================================
// HELPERS
// ============================================

const parseAmericanOdds = (oddsStr: string): number => {
  if (!oddsStr) return -110; // Default assumption
  const cleaned = oddsStr.replace('+', '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? -110 : val;
};

const calculateProfit = (wager: number, americanOdds: number): number => {
  if (americanOdds > 0) {
    return wager * (americanOdds / 100);
  } else {
    return wager * (100 / Math.abs(americanOdds));
  }
};

const getGameHour = (dateStr: string): number => {
  const d = new Date(dateStr);
  return d.getHours();
};

const formatHour = (hour: number): string => {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
};

// ============================================
// DIVERSIFICATION ANALYSIS
// ============================================

export const analyzeDiversification = (
  games: QueuedGame[],
  bankroll: number,
  unitPct: number
): DiversificationWarning[] => {
  const warnings: DiversificationWarning[] = [];
  
  // Only analyze PLAYABLE games
  const playable = games.filter(g => g.analysis?.decision === 'PLAYABLE');
  
  if (playable.length < 2) return warnings; // No diversification concerns with 0-1 picks
  
  const total = playable.length;
  
  // === SPORT CONCENTRATION ===
  const bySport: Record<string, number> = {};
  playable.forEach(g => {
    bySport[g.sport] = (bySport[g.sport] || 0) + 1;
  });
  
  const sportEntries = Object.entries(bySport).sort((a, b) => b[1] - a[1]);
  const topSport = sportEntries[0];
  
  if (topSport && topSport[1] > total / 2 && topSport[1] >= 3) {
    warnings.push({
      type: 'SPORT',
      severity: topSport[1] >= total * 0.75 ? 'WARNING' : 'CAUTION',
      title: `${topSport[0]} Heavy`,
      message: `${topSport[1]} of ${total} picks are ${topSport[0]}. A bad night for that league affects most of your card.`,
      breakdown: sportEntries.map(([s, c]) => `${s}: ${c}`).join(', ')
    });
  }
  
  // === MARKET CONCENTRATION ===
  const byMarket: Record<string, number> = {};
  playable.forEach(g => {
    const market = g.analysis?.market || 'Unknown';
    byMarket[market] = (byMarket[market] || 0) + 1;
  });
  
  const marketEntries = Object.entries(byMarket).sort((a, b) => b[1] - a[1]);
  const topMarket = marketEntries[0];
  
  if (topMarket && topMarket[1] >= total * 0.6 && topMarket[1] >= 3) {
    warnings.push({
      type: 'MARKET',
      severity: topMarket[1] >= total * 0.8 ? 'WARNING' : 'CAUTION',
      title: `${topMarket[0]}s Dominant`,
      message: `${topMarket[1]} of ${total} picks are ${topMarket[0]}s. Consider mixing market types for diversification.`,
      breakdown: marketEntries.map(([m, c]) => `${m}: ${c}`).join(', ')
    });
  }
  
  // === DIRECTIONAL CONCENTRATION (Totals) ===
  const totalsPicks = playable.filter(g => g.analysis?.market === 'Total');
  if (totalsPicks.length >= 2) {
    const overs = totalsPicks.filter(g => g.analysis?.side === 'OVER').length;
    const unders = totalsPicks.length - overs;
    
    if (overs === totalsPicks.length) {
      warnings.push({
        type: 'DIRECTION',
        severity: totalsPicks.length >= 3 ? 'WARNING' : 'CAUTION',
        title: 'All Overs',
        message: `All ${totalsPicks.length} totals are Overs. You're exposed to a league-wide scoring slump.`,
        breakdown: `Overs: ${overs}, Unders: ${unders}`
      });
    } else if (unders === totalsPicks.length) {
      warnings.push({
        type: 'DIRECTION',
        severity: totalsPicks.length >= 3 ? 'WARNING' : 'CAUTION',
        title: 'All Unders',
        message: `All ${totalsPicks.length} totals are Unders. A fast-paced night hurts everywhere.`,
        breakdown: `Overs: ${overs}, Unders: ${unders}`
      });
    }
  }
  
  // === DIRECTIONAL CONCENTRATION (Favorites/Underdogs) ===
  const sidePicks = playable.filter(g => 
    g.analysis?.market === 'Spread' || g.analysis?.market === 'Moneyline'
  );
  
  if (sidePicks.length >= 3) {
    let favorites = 0;
    let underdogs = 0;
    
    sidePicks.forEach(g => {
      if (!g.sharpLines || !g.analysis) return;
      
      const side = g.analysis.side;
      const awaySpread = parseFloat(g.sharpLines.spreadLineA);
      if (isNaN(awaySpread)) return;
      
      const awayIsFavorite = awaySpread < 0;
      
      if (side === 'AWAY') {
        awayIsFavorite ? favorites++ : underdogs++;
      } else if (side === 'HOME') {
        awayIsFavorite ? underdogs++ : favorites++;
      }
    });
    
    const totalSides = favorites + underdogs;
    
    if (favorites >= totalSides * 0.75 && favorites >= 3) {
      warnings.push({
        type: 'DIRECTION',
        severity: favorites === totalSides ? 'WARNING' : 'CAUTION',
        title: 'Favorite Heavy',
        message: `${favorites} of ${totalSides} sides are favorites. An upset-heavy night hurts across your card.`,
        breakdown: `Favorites: ${favorites}, Underdogs: ${underdogs}`
      });
    } else if (underdogs >= totalSides * 0.75 && underdogs >= 3) {
      warnings.push({
        type: 'DIRECTION',
        severity: underdogs === totalSides ? 'WARNING' : 'CAUTION',
        title: 'Underdog Heavy',
        message: `${underdogs} of ${totalSides} sides are underdogs. You need multiple upsets to profit.`,
        breakdown: `Favorites: ${favorites}, Underdogs: ${underdogs}`
      });
    }
  }
  
  // === TIME SLOT CLUSTERING ===
  const byHour: Record<number, QueuedGame[]> = {};
  playable.forEach(g => {
    const hour = getGameHour(g.date);
    if (!byHour[hour]) byHour[hour] = [];
    byHour[hour].push(g);
  });
  
  const clusteredHours = Object.entries(byHour)
    .filter(([_, games]) => games.length >= 3)
    .sort((a, b) => b[1].length - a[1].length);
  
  if (clusteredHours.length > 0) {
    const [hourStr, hourGames] = clusteredHours[0];
    warnings.push({
      type: 'TIME_SLOT',
      severity: 'INFO',
      title: `${hourGames.length} Games at ${formatHour(parseInt(hourStr))}`,
      message: `These games start simultaneously — no time to adjust if early action goes sideways.`,
      breakdown: hourGames.map(g => `${g.awayTeam.name} @ ${g.homeTeam.name}`).join(', ')
    });
  }
  
  return warnings;
};

// ============================================
// P&L PROJECTION
// ============================================

interface PickFinancials {
  wager: number;
  potentialProfit: number;
  odds: number;
}

export const calculatePLScenarios = (
  games: QueuedGame[],
  bankroll: number,
  unitPct: number
): { scenarios: PLScenario[], totalWagered: number, pickDetails: PickFinancials[] } => {
  
  // Only analyze PLAYABLE games (or those with cardSlot if auto-picked)
  const playable = games.filter(g => g.analysis?.decision === 'PLAYABLE');
  
  if (playable.length === 0) {
    return { scenarios: [], totalWagered: 0, pickDetails: [] };
  }
  
  const oneUnit = (bankroll * unitPct) / 100;
  
  // Calculate financials for each pick
  const pickDetails: PickFinancials[] = playable.map(g => {
    const confidence = g.analysis?.confidence || 'MEDIUM';
    let unitMultiplier = 1.0;
    if (confidence === 'HIGH') unitMultiplier = 1.5;
    if (confidence === 'LOW') unitMultiplier = 0.5;
    
    const wager = oneUnit * unitMultiplier;
    const odds = parseAmericanOdds(g.analysis?.softBestOdds || '-110');
    const potentialProfit = calculateProfit(wager, odds);
    
    return { wager, potentialProfit, odds };
  });
  
  const totalWagered = pickDetails.reduce((sum, p) => sum + p.wager, 0);
  const totalPotentialProfit = pickDetails.reduce((sum, p) => sum + p.potentialProfit, 0);
  
  // Average values for scenario calculation
  const avgWager = totalWagered / playable.length;
  const avgProfit = totalPotentialProfit / playable.length;
  
  const n = playable.length;
  const scenarios: PLScenario[] = [];
  
  // Generate scenarios from best to worst
  for (let wins = n; wins >= 0; wins--) {
    const losses = n - wins;
    const expectedProfit = wins * avgProfit;
    const expectedLoss = losses * avgWager;
    const netPL = expectedProfit - expectedLoss;
    
    // Determine break-even zone (around 50-55% wins for standard -110 juice)
    const winPct = wins / n;
    const isBreakEven = Math.abs(netPL) < avgWager; // Within one unit of break-even
    
    // Color coding
    let color = 'text-ink-text/60';
    if (netPL > avgWager * 2) color = 'text-status-win';
    else if (netPL > 0) color = 'text-status-win';
    else if (isBreakEven) color = 'text-amber-300';
    else if (netPL > -avgWager * 2) color = 'text-status-loss';
    else color = 'text-status-loss';
    
    scenarios.push({
      record: `${wins}-${losses}`,
      wins,
      losses,
      netPL: Math.round(netPL * 100) / 100,
      isBreakEven,
      color
    });
  }
  
  return { scenarios, totalWagered, pickDetails };
};

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

export const analyzeCard = (
  games: QueuedGame[],
  bankroll: number,
  unitPct: number,
  autoPickedOnly: boolean = false
): CardAnalytics => {
  
  // If autoPickedOnly, filter to just slotted games
  const targetGames = autoPickedOnly 
    ? games.filter(g => g.cardSlot !== undefined)
    : games;
  
  const diversificationWarnings = analyzeDiversification(targetGames, bankroll, unitPct);
  const { scenarios, totalWagered, pickDetails } = calculatePLScenarios(targetGames, bankroll, unitPct);
  
  const maxProfit = scenarios.length > 0 ? scenarios[0].netPL : 0;
  const maxLoss = scenarios.length > 0 ? scenarios[scenarios.length - 1].netPL : 0;
  
  return {
    diversificationWarnings,
    plScenarios: scenarios,
    totalWagered,
    maxProfit,
    maxLoss
  };
};
