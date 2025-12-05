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
  decision: 'PRIMARY' | 'LEAN' | 'PASS';
  units?: number;
  market?: string;
  side?: string;
  line?: string;
  odds?: string;
  book?: string;
  winProbability?: number;
  fullAnalysis: string;
}

export interface AnalysisState {
  queue: QueuedGame[];
  addToQueue: (game: Game) => void;
  removeFromQueue: (gameId: string) => void;
  updateGame: (gameId: string, updates: Partial<QueuedGame>) => void;
  addSoftLines: (gameId: string, lines: BookLines) => void;
  setSharpLines: (gameId: string, lines: BookLines) => void;
}
