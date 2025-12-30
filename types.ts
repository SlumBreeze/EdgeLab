
export type Sport = 'NBA' | 'NFL' | 'NHL' | 'CFB';

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
  autoPickBestGames: (limit?: number) => void;

  // v2.2 Bankroll
  bankroll: SportsbookAccount[];
  updateBankroll: (bookName: string, balance: number) => void;
  totalBankroll: number;
  unitSizePercent: number; // e.g., 1 (1%) or 2 (2%)
  setUnitSizePercent: (pct: number) => void;

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
