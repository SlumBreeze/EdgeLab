
import React from 'react';
import { useGameContext } from '../hooks/useGameContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BankrollModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { bankroll, updateBankroll, totalBankroll, unitSizePercent, setUnitSizePercent } = useGameContext();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div>
             <div className="flex items-center gap-2">
                <span className="text-2xl">💰</span>
                <h2 className="text-xl font-bold text-slate-800">Manage Bankroll</h2>
             </div>
             <p className="text-xs text-slate-400 mt-1">Track balances for smarter wager sizing</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Total Summary */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-4 text-white shadow-lg mb-6">
            <div className="text-sm opacity-70 uppercase tracking-wider font-bold mb-1">Total Bankroll</div>
            <div className="text-3xl font-bold">${totalBankroll.toFixed(2)}</div>
            <div className="mt-4 flex items-center gap-2">
                <div className="text-xs opacity-70">Unit Size Setting:</div>
                <div className="flex bg-slate-900/50 rounded-lg p-1">
                    {[1, 2, 3, 5].map(pct => (
                        <button
                            key={pct}
                            onClick={() => setUnitSizePercent(pct)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                                unitSizePercent === pct 
                                ? 'bg-coral-500 text-white shadow-sm' 
                                : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            {pct}%
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-2 text-xs opacity-60">
                1 Unit = ${(totalBankroll * (unitSizePercent/100)).toFixed(2)}
            </div>
          </div>

          {/* Book List */}
          <div className="space-y-3">
            {bankroll.map((account) => {
              const percent = totalBankroll > 0 ? (account.balance / totalBankroll) * 100 : 0;
              
              return (
                <div key={account.name} className="flex items-center gap-3 bg-white border border-slate-100 p-3 rounded-xl shadow-sm hover:border-slate-300 transition-colors">
                  {/* Color Bar indicator */}
                  <div className={`w-1.5 self-stretch rounded-full ${account.color || 'bg-slate-400'}`} />
                  
                  <div className="flex-1">
                    <div className="font-bold text-slate-700">{account.name}</div>
                    {/* Visual Bar */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div 
                            className={`h-full rounded-full ${account.color || 'bg-slate-400'}`} 
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input
                            type="number"
                            value={account.balance || ''}
                            onChange={(e) => updateBankroll(account.name, parseFloat(e.target.value) || 0)}
                            className="w-24 pl-5 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-right font-mono font-bold text-slate-800 focus:outline-none focus:border-coral-400 focus:ring-2 focus:ring-coral-100 transition-all"
                            placeholder="0.00"
                        />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50">
            <button 
                onClick={onClose}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-all shadow-md"
            >
                Done
            </button>
            <p className="text-[10px] text-center text-slate-400 mt-2">
                Use "Set Balance" to match your actual sportsbook balance
            </p>
        </div>
      </div>
    </div>
  );
};
