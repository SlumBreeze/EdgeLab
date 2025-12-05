export type Sport = 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'CFB' | 'CBB';

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
}

export interface HighHitAnalysis {
  decision: 'PLAYABLE' | 'PASS';
  vetoTriggered: boolean;
  vetoReason?: string;
  
  // Line shopping data (calculated in TypeScript, not by AI)
  sharpImpliedProb?: number;
  softBestOdds?: string;
  softBestBook?: string;
  lineValueCents?: number; // How much better is soft vs sharp (in cents of juice)
  lineValuePoints?: number; // Spread/total point difference if any

  // AI-provided context (narrative only, no numbers)
  market?: string;
  side?: string;
  line?: string;
  researchSummary: string; // What the AI found (injuries, rest, etc.)
  edgeNarrative?: string; // Plain English description of any edge
}

export interface DailyPlayTracker {
  date: string; // YYYY-MM-DD
  playCount: number;
  gameIds: string[];
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
}
