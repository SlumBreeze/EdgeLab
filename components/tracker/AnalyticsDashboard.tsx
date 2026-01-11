import React from 'react';
import { AdvancedStats, BankrollHistoryPoint } from '../../types';
import { formatCurrency } from '../../utils/calculations';
import { Trophy, AlertTriangle } from 'lucide-react';
import { BankrollTrendChart } from './BankrollTrendChart';

interface AnalyticsDashboardProps {
  stats: AdvancedStats;
  bankrollHistory: BankrollHistoryPoint[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ stats, bankrollHistory }) => {
  // If no data, don't show dashboard
  if (stats.last10.length === 0) return null;

  return (
    <div className="space-y-6">
      
      {/* Chart Section */}
      <BankrollTrendChart data={bankrollHistory} />
      
      {/* Hot/Cold Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Hottest Sport */}
        <div className="bg-ink-paper/50 backdrop-blur-sm border border-ink-gray rounded-xl p-5 relative shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
               <Trophy size={20} />
            </div>
            <span className="text-ink-text/60 font-bold text-xs uppercase tracking-wider">Best Sport</span>
          </div>
          {stats.hottestSport ? (
            <div>
              <h4 className="text-2xl font-bold text-ink-text">{stats.hottestSport.name}</h4>
              <p className="text-status-win font-mono text-sm font-bold">+{formatCurrency(stats.hottestSport.profit)}</p>
              <p className="text-ink-text/60 text-xs mt-1">Record: {stats.hottestSport.record}</p>
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center">
              <p className="text-ink-text/40 text-sm">Not enough data</p>
            </div>
          )}
        </div>

        {/* Coldest Sport */}
        <div className="bg-ink-paper/50 backdrop-blur-sm border border-ink-gray rounded-xl p-5 relative shadow-sm">
           <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
               <AlertTriangle size={20} />
            </div>
            <span className="text-ink-text/60 font-bold text-xs uppercase tracking-wider">Worst Sport</span>
          </div>
          {stats.coldestSport ? (
            <div>
              <h4 className="text-2xl font-bold text-ink-text">{stats.coldestSport.name}</h4>
              <p className="text-status-loss font-mono text-sm font-bold">{formatCurrency(stats.coldestSport.profit)}</p>
              <p className="text-ink-text/60 text-xs mt-1">Record: {stats.coldestSport.record}</p>
            </div>
          ) : (
             <div className="h-full flex flex-col justify-center">
               <p className="text-ink-text/40 text-sm">Not enough data</p>
             </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* Performance By Book */}
        <div className="bg-ink-paper/50 backdrop-blur-sm border border-ink-gray rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-ink-gray bg-ink-base/50">
             <h3 className="font-bold text-ink-text text-sm">Profit by Sportsbook</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-base/50 text-ink-text/60 text-xs uppercase font-semibold">
              <tr>
                <th className="px-4 py-2">Book</th>
                <th className="px-4 py-2 text-right">Profit</th>
                <th className="px-4 py-2 text-right">Win %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-gray">
              {stats.bookPerformance.map((book) => (
                <tr key={book.name} className="hover:bg-ink-base/50">
                  <td className="px-4 py-2.5 font-medium text-ink-text">{book.name}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${book.profit > 0 ? 'text-status-win' : book.profit < 0 ? 'text-status-loss' : 'text-ink-text/40'}`}>
                    {book.profit > 0 ? '+' : ''}{formatCurrency(book.profit)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink-text/60">
                    {book.winRate.toFixed(0)}%
                  </td>
                </tr>
              ))}
              {stats.bookPerformance.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-text/40 text-xs">No settled bets yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
