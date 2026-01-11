import React from 'react';
import { AdvancedStats, BankrollHistoryPoint } from '../../types';
import { formatCurrency } from '../../utils/calculations';
import { Trophy, AlertTriangle } from 'lucide-react';

interface AnalyticsDashboardProps {
  stats: AdvancedStats;
  bankrollHistory: BankrollHistoryPoint[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ stats }) => {
  if (stats.last10.length === 0) return null;

  return (
    <div className="space-y-4">
      
      {/* Hot/Cold Small Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Best Sport */}
        <div className="bg-ink-paper border border-ink-gray rounded-xl p-4 relative overflow-hidden group hover:border-ink-accent/30 transition-all">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={14} className="text-amber-400" />
            <span className="text-ink-text/40 font-bold text-[10px] uppercase tracking-wider">Best Sport</span>
          </div>
          {stats.hottestSport ? (
            <div>
              <h4 className="text-lg font-bold text-ink-text truncate">{stats.hottestSport.name}</h4>
              <p className="text-status-win font-mono text-xs font-bold">+{formatCurrency(stats.hottestSport.profit)}</p>
            </div>
          ) : <p className="text-ink-text/20 text-xs">--</p>}
        </div>

        {/* Worst Sport */}
        <div className="bg-ink-paper border border-ink-gray rounded-xl p-4 relative overflow-hidden group hover:border-status-loss/30 transition-all">
           <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-status-loss" />
            <span className="text-ink-text/40 font-bold text-[10px] uppercase tracking-wider">Worst Sport</span>
          </div>
          {stats.coldestSport ? (
            <div>
              <h4 className="text-lg font-bold text-ink-text truncate">{stats.coldestSport.name}</h4>
              <p className="text-status-loss font-mono text-xs font-bold">{formatCurrency(stats.coldestSport.profit)}</p>
            </div>
          ) : <p className="text-ink-text/20 text-xs">--</p>}
        </div>
      </div>

      {/* Mini Book Performance Table */}
      <div className="bg-ink-paper border border-ink-gray rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-2 border-b border-ink-gray bg-ink-base/50">
            <h3 className="font-bold text-ink-text text-xs uppercase tracking-wider">Book Performance</h3>
        </div>
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-ink-gray/30">
            {stats.bookPerformance.slice(0, 5).map((book) => (
              <tr key={book.name} className="hover:bg-ink-base/30">
                <td className="px-4 py-2 font-medium text-ink-text/80">{book.name}</td>
                <td className={`px-4 py-2 text-right font-mono font-bold ${book.profit > 0 ? 'text-status-win' : book.profit < 0 ? 'text-status-loss' : 'text-ink-text/40'}`}>
                  {book.profit > 0 ? '+' : ''}{formatCurrency(book.profit)}
                </td>
              </tr>
            ))}
            {stats.bookPerformance.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-3 text-center text-ink-text/40">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};