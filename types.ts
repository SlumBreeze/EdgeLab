export type Sport = 'NBA' | 'NFL' | 'NHL' | 'CFB' | 'Other';

export interface Game {
  id: string;
  sport: Sport;
  date: string;
  homeTeam: { name: string; score?: string; record?: string; logo?: string };
  awayTeam: { name: string; score?: string; record?: string; logo?: string };
  status: string;
  period?: number;
  clock?: string;
  odds?: {
    spread?: string;
    total?: number;
    details?: string;
  };
}

export interface BookLines {
  bookName: string;
  spreadLineA: string;
  spreadOddsA: string;
  spreadLineB: string;
  spreadOddsB: string;
  totalLine: string;
  totalOddsOver: string;
  totalOddsUnder: string;
  mlOddsA: string;
  mlOddsB: string;
}

export type FactSourceType = 'NBA_INJURY_REPORT' | 'BOX_SCORE' | 'ODDS_API';
export type FactConfidence = 'HIGH' | 'MEDIUM';

export interface Fact {
  claim: string;
  source_type: FactSourceType;
  confidence: FactConfidence;
  source_ref?: string;
}

export type InjuryStatus = 'OUT' | 'QUESTIONABLE' | 'PROBABLE';

export interface InjuryFact {
  team: string;
  player: string;
  status: InjuryStatus;
  source: 'NBA_INJURY_REPORT';
}

export interface QueuedGame extends Game {
  visibleId: string;
  addedAt: number;
  edgeSignal?: 'RED' | 'YELLOW' | 'WHITE';
  edgeDescription?: string;
  sharpLines?: BookLines;
  softLines: BookLines[];
  analysis?: HighHitAnalysis;
  isAnalyzing?: boolean;
  cardSlot?: number;
  analysisError?: string; // Error message if Quick Analyze failed
}

export interface HighHitAnalysis {
  decision: 'PLAYABLE' | 'PASS';
  vetoTriggered: boolean;
  vetoReason?: string;
  caution?: string; // New field for yellow card warnings (e.g., bad ML juice)
  
  // Math-derived recommendation
  recommendation?: string;  // "Buffalo Sabres Moneyline"
  recLine?: string;         // "+145" or "-6.5 (-108)"
  recProbability?: number;  // Fair prob for this specific bet
  
  // Line shopping data (calculated in TypeScript, not by AI)
  sharpImpliedProb?: number;
  softBestOdds?: string;
  softBestBook?: string;
  lineValueCents?: number; // How much better is soft vs sharp (in cents of juice)
  lineValuePoints?: number; // Spread/total point difference if any

  // Thresholds
  lineFloor?: string;
  oddsFloor?: string;
  floorReason?: string;

  // Pro Analysis Fields
  publicNarrative?: string;  // The "story" the public is betting on
  gameScript?: string;       // Expected game flow (pace, style)

  // AI-provided context (narrative only, no numbers)
  market?: string;
  side?: string;
  line?: string;
  researchSummary: string; // What the AI found (injuries, rest, etc.)
  edgeNarrative?: string; // Plain English description of any situational edge. Do NOT assign percentages.
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  dataQuality?: 'STRONG' | 'PARTIAL' | 'WEAK';
  factsUsed?: Fact[];
  narrativeAnalysis?: string;
  injuries?: InjuryFact[];
  factConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  dominanceRatio?: number;
}

export interface DailyPlayTracker {
  date: string; // YYYY-MM-DD
  playCount: number;
  gameIds: string[];
}

export interface SportsbookAccount {
  name: string;
  balance: number;
  color?: string; // For UI visualization
}

export interface ScanResult {
  signal: 'RED' | 'YELLOW' | 'WHITE';
  description: string;
}

export interface ReferenceLineData {
  spreadLineA: string;
  spreadLineB: string;
}

// Return type for smart auto-pick
export interface AutoPickResult {
  picked: number;
  skipped: number;
  reasons: string[];
}

export interface AnalysisState {
  queue: QueuedGame[];
  addToQueue: (game: Game) => void;
  removeFromQueue: (gameId: string) => void;
  updateGame: (gameId: string, updates: Partial<QueuedGame>) => void;
  addSoftLines: (gameId: string, lines: BookLines) => void;
  updateSoftLineBook: (gameId: string, index: number, newBookName: string) => void;
  setSharpLines: (gameId: string, lines: BookLines) => void;
  
  // v2.1 New State
  dailyPlays: DailyPlayTracker;
  getPlayableCount: () => number;
  canAddMorePlays: () => boolean;
  markAsPlayed: (gameId: string) => void;
  
  // UPDATED: Smart auto-pick returns stats about what was picked
  autoPickBestGames: () => AutoPickResult;

  // v2.2 Bankroll
  bankroll: SportsbookAccount[];
  updateBankroll: (bookName: string, balance: number) => void;
  totalBankroll: number;
  unitSizePercent: number; // e.g., 1 (1%) or 2 (2%)
  setUnitSizePercent: (pct: number) => void;
  bookBalances: BookBalanceDisplay[];
  updateBookDeposit: (sportsbook: string, newDeposit: number) => void;
  bets: Bet[];
  bankrollState: BankrollState;
  bankrollLoading: boolean;
  addBet: (betData: Bet) => Promise<void>;
  updateBetStatus: (id: string, status: BetStatus) => Promise<void>;
  updateBet: (updatedBet: Bet) => Promise<void>;
  deleteBet: (id: string) => Promise<void>;
  refreshBankroll: () => Promise<void>;

  // Scan & Reference Data
  scanResults: Record<string, ScanResult>;
  setScanResult: (gameId: string, result: ScanResult) => void;
  referenceLines: Record<string, ReferenceLineData>;
  setReferenceLine: (gameId: string, data: ReferenceLineData) => void;

  // v2.3 Raw Slate Persistence
  allSportsData: Record<string, any[]>;
  loadSlates: (data: Record<string, any[]>) => void;

  // v2.4 Sync Status
  syncStatus: 'idle' | 'saving' | 'saved' | 'error';
  
  // v2.5 User Identity
  userId: string;
  setUserId: (id: string) => void;

  // v2.6 Active Books (Derived from Bankroll)
  activeBookNames: string[];
}

// --- ProBet Tracker Types ---

export enum BetStatus {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
  PUSH = 'PUSH',
}

export enum Sportsbook {
  DRAFTKINGS = 'DraftKings',
  FANDUEL = 'FanDuel',
  BETMGM = 'BetMGM',
  CAESARS = 'Caesars',
  BET365 = 'Bet365',
  POINTSBET = 'PointsBet',
  THESCOREBET = 'theScore Bet',
  FLIFF = 'Fliff',
  FANATICS = 'Fanatics',
  PRIZEPICKS = 'PrizePicks',
  UNDERDOG = 'Underdog Fantasy',
  DRAFTERS = 'Drafters',
  BETR = 'Betr',
  BOVADA = 'Bovada',
  BETONLINE = 'BetOnline',
  OTHER = 'Other',
}

export interface Bet {
  id: string;
  date: string;
  matchup: string;
  sport: string;
  sportsbook: Sportsbook;
  pick: string;
  odds: number;
  wager: number;
  potentialProfit: number;
  status: BetStatus;
  createdAt: number;
  tags?: string[];
}

export interface BookDeposit {
  sportsbook: string;
  deposited: number;
}

export interface BookBalanceDisplay {
  sportsbook: string;
  deposited: number;
  currentBalance: number;
}

export interface BankrollState {
  startingBalance: number;
  currentBalance: number;
  totalWagered: number;
  totalWon: number; // Pure profit
  totalLost: number;
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  roi: number;
  flatROI: number;
}

export interface AdvancedStats {
  currentStreak: number;
  last10: BetStatus[];
  hottestSport: { name: string; profit: number; record: string } | null;
  coldestSport: { name: string; profit: number; record: string } | null;
  bookPerformance: { name: string; profit: number; wins: number; losses: number; winRate: number }[];
  teamPerformance: { name: string; profit: number; wins: number; losses: number }[];
}

export interface BankrollHistoryPoint {
  date: string;
  balance: number;
  formattedDate: string;
}

export interface GameScore {
  id: string;
  date: string; // YYYY-MM-DD
  sport: string; // e.g. "NFL", "NBA"
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL' | 'POSTPONED';
  clock: string; // e.g. "Q4 2:30" or "Final"
  period: number;
  homeTeam: string; // Abbreviation e.g. "LAL"
  homeTeamName: string; // Mascot e.g. "Lakers"
  homeScore: number;
  awayTeam: string; // Abbreviation e.g. "BOS"
  awayTeamName: string; // Mascot e.g. "Celtics"
  awayScore: number;
  winner?: 'home' | 'away';
}

export type ScoreMap = Record<string, GameScore[]>; // Key is YYYY-MM-DD
