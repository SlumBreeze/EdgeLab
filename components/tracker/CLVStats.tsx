import React from 'react';
import { Target, TrendingUp, BarChart3, AlertCircle } from 'lucide-react';
import { Bet } from '../../types';
import { calculateBeatRate, calculateXROI } from '../../utils/clvUtils';
import { formatCurrency } from '../../utils/calculations';

interface Props {
  bets: Bet[];
}

export const CLVStats: React.FC<Props> = ({ bets }) => {
  const settledBets = bets.filter(b => b.status !== 'PENDING');
  const clvBets = settledBets.filter(b => b.clv_percent !== undefined);
  
  const beatRate = calculateBeatRate(clvBets);
  const avgAlpha = clvBets.length > 0 
    ? clvBets.reduce((sum, b) => sum + (b.clv_percent || 0), 0) / clvBets.length 
    : 0;
  const xROI = calculateXROI(clvBets);
  
  const actualROI = settledBets.length > 0
    ? (settledBets.reduce((sum, b) => sum + (b.status === 'WON' ? b.potentialProfit : b.status === 'LOST' ? -b.wager : 0), 0) / 
       settledBets.reduce((sum, b) => sum + b.wager, 0)) * 100
    : 0;

  const isLuckGap = Math.abs(xROI - actualROI) > 5; // >5% gap suggests significant variance

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {/* Beat Rate Card */}
      <div className="bg-ink-panel border border-ink-gray p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 text-ink-text/40 mb-2">
          <Target size={14} className="text-ink-accent" />
          <span className="text-[10px] font-bold uppercase tracking-wider">CLV Beat Rate</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-ink-text">{beatRate.toFixed(1)}%</span>
          <span className="text-[10px] text-ink-text/40 font-medium">Global</span>
        </div>
      </div>

      {/* Average Alpha Card */}
      <div className="bg-ink-panel border border-ink-gray p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 text-ink-text/40 mb-2">
          <TrendingUp size={14} className="text-status-win" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Avg Alpha (Edge)</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-mono font-bold ${avgAlpha >= 0 ? 'text-status-win' : 'text-status-loss'}`}>
            {avgAlpha >= 0 ? '+' : ''}{avgAlpha.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Expected ROI Card */}
      <div className="bg-ink-panel border border-ink-gray p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 text-ink-text/40 mb-2">
          <BarChart3 size={14} className="text-ink-accent" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Expected ROI</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-ink-text">{xROI.toFixed(1)}%</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            actualROI >= xROI ? 'bg-status-win/10 border-status-win text-status-win' : 'bg-status-loss/10 border-status-loss text-status-loss'
          }`}>
            Actual: {actualROI.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Variance Alert Card */}
      <div className={`p-4 rounded-xl shadow-sm border ${
        isLuckGap ? 'bg-amber-500/5 border-amber-500/30' : 'bg-ink-panel border-ink-gray'
      }`}>
        <div className="flex items-center gap-2 text-ink-text/40 mb-2">
          <AlertCircle size={14} className={isLuckGap ? 'text-amber-500' : 'text-ink-gray'} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Market Variance</span>
        </div>
        <div className="text-xs font-mono leading-tight">
          {isLuckGap ? (
            <span className="text-amber-500 uppercase font-bold">
              {actualROI > xROI ? 'Running Hot (Luck)' : 'Running Cold (Variance)'}
            </span>
          ) : (
            <span className="text-ink-text/60 uppercase">Normal Distribution</span>
          )}
          <p className="text-[9px] text-ink-text/40 mt-1 uppercase">
            Process quality vs results
          </p>
        </div>
      </div>
    </div>
  );
};
