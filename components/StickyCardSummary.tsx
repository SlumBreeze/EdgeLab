
import React from 'react';
import { CardAnalytics } from '../utils/cardAnalytics';

// ============================================
// TYPES
// ============================================

interface StickyCardSummaryProps {
  pickCount: number;
  playableCount: number;
  passedCount: number;
  analytics: CardAnalytics;
  hasAutoPicked: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const StickyCardSummary: React.FC<StickyCardSummaryProps> = ({
  pickCount,
  playableCount,
  passedCount,
  analytics,
  hasAutoPicked
}) => {
  // Don't show if there's nothing to summarize
  if (playableCount === 0 && passedCount === 0) return null;

  // Determine the active count we're showing
  const activeCount = hasAutoPicked ? pickCount : playableCount;
  
  // Calculate quick risk summary
  const hasWarnings = analytics.diversificationWarnings.length > 0;
  const highSeverityWarnings = analytics.diversificationWarnings.filter(
    w => w.severity === 'WARNING'
  ).length;

  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm mb-4">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Pick Count & Status */}
        <div className="flex items-center gap-3">
          {/* Pick Badge */}
          <div className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold
            ${hasAutoPicked 
              ? 'bg-amber-100 text-amber-700 border border-amber-200' 
              : 'bg-teal-100 text-teal-700 border border-teal-200'
            }
          `}>
            <span>{hasAutoPicked ? '🎯' : '✅'}</span>
            <span>{activeCount} {hasAutoPicked ? 'picks' : 'playable'}</span>
          </div>

          {/* Passed Count (smaller, muted) */}
          {passedCount > 0 && (
            <div className="text-xs text-slate-400 font-medium">
              {passedCount} passed
            </div>
          )}
        </div>

        {/* Center: Warning Indicator (if any) */}
        {hasWarnings && (
          <div className={`
            flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
            ${highSeverityWarnings > 0 
              ? 'bg-red-100 text-red-600' 
              : 'bg-amber-100 text-amber-600'
            }
          `}>
            <span>⚠️</span>
            <span>{analytics.diversificationWarnings.length}</span>
          </div>
        )}

        {/* Right: P&L Summary */}
        {analytics.totalWagered > 0 && (
          <div className="flex items-center gap-3 text-xs">
            {/* Total Wagered */}
            <div className="text-slate-500">
              <span className="font-mono font-bold text-slate-700">
                ${analytics.totalWagered.toFixed(0)}
              </span>
              <span className="ml-0.5">risk</span>
            </div>

            {/* Best/Worst Range */}
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-mono font-bold">
                +{analytics.maxProfit.toFixed(0)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-red-500 font-mono font-bold">
                {analytics.maxLoss.toFixed(0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StickyCardSummary;
