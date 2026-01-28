import React from 'react';
import { Game, BookLines, Sport } from '../types';
import { formatEtTime, getTimeWindow, getTimeWindowLabel } from '../utils/timeWindow';
import { getCadenceStatus, getStatusLabel, getStatusColor } from '../utils/cadence';

interface ScoutGameCardProps {
  game: any;                    // Raw API game object
  sport: Sport;
  pinnLines: BookLines | null;
  referenceLines: { spreadLineA: string; spreadLineB: string } | undefined;
  scanResult: { signal: string; description: string } | undefined;
  isScanning: boolean;
  isBatchScanning: boolean;
  inQueue: boolean;
  movement: { icon: string; text: string; color: string } | null;
  onQuickScan: (gameObj: Game) => void;
  onAddToQueue: (game: any, sport: Sport, pinnLines: BookLines | null) => void;
  mapToGameObject: (apiGame: any, sport: Sport, pinnLines: BookLines | null) => Game;
}

const getEdgeEmoji = (signal: string) => signal === 'RED' ? '🔴' : signal === 'YELLOW' ? '🟡' : '⚪';

const ScoutGameCard: React.FC<ScoutGameCardProps> = ({
  game,
  sport,
  pinnLines,
  referenceLines: ref,
  scanResult: scan,
  isScanning,
  isBatchScanning,
  inQueue,
  movement,
  onQuickScan,
  onAddToQueue,
  mapToGameObject
}) => {
  const gameObj = mapToGameObject(game, sport, pinnLines);
  const timeLabel = formatEtTime(game.commence_time);
  const windowLabel = getTimeWindowLabel(getTimeWindow(game.commence_time));
  
  const cadence = getCadenceStatus(game.commence_time, sport);
  const cadenceLabel = getStatusLabel(cadence);
  const cadenceColor = getStatusColor(cadence);

  return (
    <div className="bg-ink-paper border border-ink-gray rounded-xl p-3 shadow-sm transition-shadow relative overflow-hidden">
      {scan && <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${scan.signal === 'RED' ? 'bg-status-loss' : scan.signal === 'YELLOW' ? 'bg-amber-400' : 'bg-ink-gray'}`} />}
      <div className="flex justify-between items-center mb-2 pl-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-bold text-ink-text/40 uppercase tracking-wider">{timeLabel}</div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cadenceColor}`}>
              {cadenceLabel}
            </span>
          </div>
        </div>
        <button onClick={() => onAddToQueue(game, sport, pinnLines)} disabled={inQueue} className={`px-2 py-1 rounded text-[10px] font-bold transition-colors border ${inQueue ? 'bg-ink-base text-ink-text/40 border-ink-gray' : 'bg-ink-accent/10 text-ink-accent border-ink-accent/30 hover:bg-ink-accent/20'}`}>{inQueue ? '✓ Queue' : '+ Add'}</button>
      </div>
      <div className="mb-2 pl-2">
        <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-1 mb-1 text-[9px] text-ink-text/40 uppercase font-bold tracking-wider"><div>Team</div><div className="text-center">Ref</div><div className="text-center">Curr</div><div className="text-center">Move</div></div>
        <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-1 items-center py-1 border-b border-ink-gray">
          <div className="font-bold text-ink-text truncate text-xs">{game.away_team}</div>
          <div className="text-center text-ink-text/40 text-[10px] font-mono">{ref?.spreadLineA || '-'}</div>
          <div className="text-center font-bold text-ink-text bg-ink-base rounded py-0.5 text-[10px] font-mono border border-ink-gray">{pinnLines?.spreadLineA || '-'}</div>
          <div className="row-span-2 flex flex-col items-center justify-center h-full">{movement && <><span className="text-sm leading-none mb-0.5">{movement.icon}</span><span className={`text-[8px] font-bold leading-none text-center ${movement.color}`}>{movement.text}</span></>}</div>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_2fr] gap-1 items-center py-1"><div className="font-bold text-ink-text truncate text-xs">{game.home_team}</div><div className="text-center text-ink-text/40 text-[10px] font-mono">{ref?.spreadLineB || '-'}</div><div className="text-center font-bold text-ink-text bg-ink-base rounded py-0.5 text-[10px] font-mono border border-ink-gray">{pinnLines?.spreadLineB || '-'}</div></div>
      </div>
      <div className="pl-2">
        {scan ? (
          <div className={`p-2 rounded-lg flex items-start gap-2 ${scan.signal === 'RED' ? 'bg-status-loss/10 border border-status-loss/20' : scan.signal === 'YELLOW' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-ink-base border border-ink-gray'}`}><span className="text-sm">{getEdgeEmoji(scan.signal)}</span><span className="text-[10px] text-ink-text/80 leading-tight font-medium">{scan.description}</span></div>
        ) : (
          <button onClick={() => onQuickScan(gameObj)} disabled={isScanning || isBatchScanning} className="w-full py-1.5 bg-ink-base hover:bg-ink-gray text-ink-text/60 hover:text-ink-text rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 border border-ink-gray">{isScanning ? <span className="animate-pulse">Scanning...</span> : <><span className="text-[10px]">⚡</span> Scan Injuries</>}</button>
        )}
      </div>
    </div>
  );
};

export default ScoutGameCard;
