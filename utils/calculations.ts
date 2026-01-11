import { Bet, BetStatus, BankrollState, AdvancedStats, BankrollHistoryPoint, BookDeposit, BookBalanceDisplay } from '../types';
import { NFL_TEAMS, NBA_TEAMS, MLB_TEAMS, NHL_TEAMS } from '../data/teams';
import { SPORTSBOOKS } from '../constants';

/**
 * Calculates the potential profit for a given wager and American odds.
 * Does not include the returned stake.
 */
export const calculatePotentialProfit = (wager: number, odds: number): number => {
  if (odds === 0) return 0;
  
  let profit = 0;
  if (odds > 0) {
    profit = wager * (odds / 100);
  } else {
    profit = wager * (100 / Math.abs(odds));
  }
  
  // Return rounded to 2 decimals
  return Math.round(profit * 100) / 100;
};

export const calculateBookBalances = (bets: Bet[], deposits: BookDeposit[]): BookBalanceDisplay[] => {
  // Map of sportsbook -> PnL (including pending deduction if desired, usually pending reduces available balance)
  const balanceChanges: Record<string, number> = {};

  bets.forEach(bet => {
    const sb = bet.sportsbook;
    if (!balanceChanges[sb]) balanceChanges[sb] = 0;

    if (bet.status === BetStatus.WON) {
      balanceChanges[sb] += bet.potentialProfit;
    } else if (bet.status === BetStatus.LOST) {
      balanceChanges[sb] -= bet.wager;
    } else if (bet.status === BetStatus.PENDING) {
      // Deduct wager from current balance for pending bets
      balanceChanges[sb] -= bet.wager;
    }
    // Push does not change balance (wager returned, no profit)
  });

  return SPORTSBOOKS.map(sb => {
    const depositObj = deposits.find(d => d.sportsbook === sb);
    const deposited = depositObj ? depositObj.deposited : 0;
    const change = balanceChanges[sb] || 0;
    
    return {
      sportsbook: sb,
      deposited,
      currentBalance: deposited + change
    };
  });
};

export const calculateBankrollStats = (deposits: BookDeposit[], bets: Bet[]): BankrollState => {
  // Total Deposited
  const startingBalance = deposits.reduce((sum, d) => sum + d.deposited, 0);

  // Calculate current total balance (Sum of all books)
  const bookBalances = calculateBookBalances(bets, deposits);
  const currentBalance = bookBalances.reduce((sum, b) => sum + b.currentBalance, 0);

  let totalWagered = 0;
  let totalWon = 0; // Net profit
  let totalLost = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;

  // Variables for Flat ROI (Unit ROI)
  let flatUnitsWon = 0;
  let flatBetsSettled = 0;

  bets.forEach((bet) => {
    if (bet.status !== BetStatus.PENDING) {
      if (bet.status === BetStatus.WON) {
        totalWon += bet.potentialProfit;
        totalWagered += bet.wager;
        wins++;

        // Flat ROI Logic: Assume 1 unit bet
        const unitProfit = bet.odds > 0 ? bet.odds / 100 : 100 / Math.abs(bet.odds);
        flatUnitsWon += unitProfit;
        flatBetsSettled++;

      } else if (bet.status === BetStatus.LOST) {
        totalLost += bet.wager;
        totalWagered += bet.wager;
        losses++;

        // Flat ROI Logic: Lost 1 unit
        flatUnitsWon -= 1;
        flatBetsSettled++;

      } else if (bet.status === BetStatus.PUSH) {
        totalWagered += bet.wager;
        pushes++;
      }
    } else {
        // Pending bets are not counted in settled wager stats, 
        // but they are deducted from currentBalance inside calculateBookBalances
    }
  });

  const settledWagered = bets
    .filter(b => b.status !== BetStatus.PENDING)
    .reduce((acc, b) => acc + b.wager, 0);

  const netProfit = totalWon - totalLost;
  const roi = settledWagered > 0 ? (netProfit / settledWagered) * 100 : 0;
  const flatROI = flatBetsSettled > 0 ? (flatUnitsWon / flatBetsSettled) * 100 : 0;

  return {
    startingBalance, // Total Deposited
    currentBalance,  // Total Available
    totalWagered,
    totalWon,
    totalLost,
    totalBets: bets.length,
    wins,
    losses,
    pushes,
    roi,
    flatROI,
  };
};

export const calculateAdvancedStats = (bets: Bet[]): AdvancedStats => {
  const settledBets = bets
    .filter(b => b.status !== BetStatus.PENDING)
    .sort((a, b) => b.createdAt - a.createdAt); // Newest first

  // 1. Last 10 Results
  const last10 = settledBets.slice(0, 10).map(b => b.status);

  // 2. Current Streak
  let streak = 0;
  if (settledBets.length > 0) {
    const firstStatus = settledBets[0].status;
    if (firstStatus === BetStatus.WON || firstStatus === BetStatus.LOST) {
      for (const bet of settledBets) {
        if (bet.status === firstStatus) {
          streak += (firstStatus === BetStatus.WON ? 1 : -1);
        } else if (bet.status !== BetStatus.PUSH) {
          break; 
        }
      }
    }
  }

  // 3. Helper for Aggregation
  const aggByField = (field: 'sport' | 'sportsbook' | 'pick') => {
    const map: Record<string, { profit: number; wins: number; losses: number; pushes: number }> = {};

    settledBets.forEach(bet => {
      let key = '';
      if (field === 'pick') {
         // Attempt to extract team name from pick or matchup logic
         // Fallback to simple logic if needed, but inferSportFromBet does mostly sport
         key = bet.pick.split(' ').slice(0, 2).join(' ').replace(/[-+0-9.]/g, '').trim(); 
         if (key.length < 3) key = bet.pick; 
      } else {
        key = bet[field] || 'Unknown';
      }

      if (!map[key]) map[key] = { profit: 0, wins: 0, losses: 0, pushes: 0 };

      if (bet.status === BetStatus.WON) {
        map[key].profit += bet.potentialProfit;
        map[key].wins++;
      } else if (bet.status === BetStatus.LOST) {
        map[key].profit -= bet.wager;
        map[key].losses++;
      } else {
        map[key].pushes++;
      }
    });
    return map;
  };

  // 4. Sport Analysis
  const sportMap = aggByField('sport');
  const sportsArr = Object.entries(sportMap).map(([name, data]) => ({
    name,
    profit: data.profit,
    record: `${data.wins}-${data.losses}-${data.pushes}`
  })).sort((a, b) => b.profit - a.profit);

  const hottestSport = sportsArr.length > 0 && sportsArr[0].profit > 0 ? sportsArr[0] : null;
  const coldestSport = sportsArr.length > 0 && sportsArr[sportsArr.length - 1].profit < 0 
    ? sportsArr[sportsArr.length - 1] 
    : null;

  // 5. Book Performance
  const bookMap = aggByField('sportsbook');
  const bookPerformance = Object.entries(bookMap).map(([name, data]) => ({
    name,
    profit: data.profit,
    wins: data.wins,
    losses: data.losses,
    winRate: (data.wins + data.losses) > 0 ? (data.wins / (data.wins + data.losses)) * 100 : 0
  })).sort((a, b) => b.profit - a.profit);

  // 6. Team Performance (Top 5 hottest teams/picks)
  const teamMap = aggByField('pick');
  const teamPerformance = Object.entries(teamMap)
    .map(([name, data]) => ({
      name,
      profit: data.profit,
      wins: data.wins,
      losses: data.losses
    }))
    .filter(t => t.wins + t.losses > 0) // Only show active items
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5); // Top 5

  return {
    currentStreak: streak,
    last10,
    hottestSport,
    coldestSport,
    bookPerformance,
    teamPerformance
  };
};

export const calculateBankrollHistory = (startingBalance: number, bets: Bet[]): BankrollHistoryPoint[] => {
  // Sort bets by date ascending
  const sortedBets = [...bets]
    .filter(b => b.status === BetStatus.WON || b.status === BetStatus.LOST || b.status === BetStatus.PUSH)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Group PnL by date
  const dailyPnL: Record<string, number> = {};
  
  sortedBets.forEach(bet => {
    if (!dailyPnL[bet.date]) dailyPnL[bet.date] = 0;
    
    if (bet.status === BetStatus.WON) {
      dailyPnL[bet.date] += bet.potentialProfit;
    } else if (bet.status === BetStatus.LOST) {
      dailyPnL[bet.date] -= bet.wager;
    }
  });

  const history: BankrollHistoryPoint[] = [];
  let currentBalance = startingBalance;

  // Iterate through sorted unique dates
  const uniqueDates = Object.keys(dailyPnL).sort();
  
  history.push({
      date: 'Start', 
      balance: startingBalance, 
      formattedDate: 'Start' 
  });

  uniqueDates.forEach(date => {
    currentBalance += dailyPnL[date];
    history.push({
      date,
      balance: currentBalance,
      formattedDate: formatDate(date).split(',')[0] // "Oct 25"
    });
  });
  
  // If no history, ensure at least start point is there
  if (history.length === 0) {
      history.push({ date: 'Start', balance: startingBalance, formattedDate: 'Start' });
  }

  return history;
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const inferSportFromBet = (bet: Partial<Bet>): string => {
   const text = `${bet.matchup || ''} ${bet.pick || ''}`.toLowerCase();
   
   if (NFL_TEAMS.some(t => text.includes(t.toLowerCase()))) return 'NFL';
   if (NBA_TEAMS.some(t => text.includes(t.toLowerCase()))) return 'NBA';
   if (MLB_TEAMS.some(t => text.includes(t.toLowerCase()))) return 'MLB';
   if (NHL_TEAMS.some(t => text.includes(t.toLowerCase()))) return 'NHL';
   
   return 'Other';
};
