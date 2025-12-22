
import React, { useState } from 'react';
import { useGameContext } from '../hooks/useGameContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BankrollModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { bankroll, updateBankroll, totalBankroll, unitSizePercent, setUnitSizePercent, userId, setUserId } = useGameContext();
  const [inputUserId, setInputUserId] = useState('');
  const [showSync, setShowSync] = useState(false);

  if (!isOpen) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(userId);
    alert("Sync ID copied! Paste this on your other device.");
  };

  const handleLoadUser = () => {
    if (inputUserId.length < 5) return;
    if (confirm("Loading this ID will replace current data on this device. Continue?")) {
        setUserId(inputUserId);
        onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div>
             <div className="flex items-center gap-2">
                <span className="text-xl">💰</span>
                <h2 className="text-lg font-bold text-slate-800">Manage Bankroll</h2>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Total Summary */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-4 text-white shadow-lg mb-4">
            <div className="flex justify-between items-end mb-2">
                <div>
                    <div className="text-[10px] opacity-70 uppercase tracking-wider font-bold mb-0.5">Total Bankroll</div>
                    <div className="text-2xl font-bold">${totalBankroll.toFixed(2)}</div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] opacity-70 uppercase tracking-wider font-bold mb-0.5">1 Unit ({unitSizePercent}%)</div>
                    <div className="text-xl font-bold text-emerald-400">${(totalBankroll * (unitSizePercent/100)).toFixed(2)}</div>
                </div>
            </div>

            {/* SLIDER RESTORED */}
            <div className="mt-4">
                <div className="flex justify-between text-[10px] opacity-60 font-bold mb-1">
                    <span>Conservative (1%)</span>
                    <span>Aggressive (5%)</span>
                </div>
                <input 
                    type="range" 
                    min="1" 
                    max="5" 
                    step="0.1"
                    value={unitSizePercent} 
                    onChange={(e) => setUnitSizePercent(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-400 hover:accent-emerald-300"
                />
            </div>
          </div>

          {/* Book List */}
          <div className="space-y-2">
            {bankroll.map((account) => {
              const percent = totalBankroll > 0 ? (account.balance / totalBankroll) * 100 : 0;
              
              return (
                <div key={account.name} className="flex items-center gap-2 bg-white border border-slate-100 p-2 rounded-xl shadow-sm hover:border-slate-300 transition-colors">
                  {/* Color Bar indicator */}
                  <div className={`w-1 self-stretch rounded-full ${account.color || 'bg-slate-400'}`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-700 text-sm truncate">{account.name}</div>
                    {/* Visual Bar */}
                    <div className="w-full bg-slate-100 h-1 rounded-full mt-1 overflow-hidden">
                        <div 
                            className={`h-full rounded-full ${account.color || 'bg-slate-400'}`} 
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                        <input
                            type="number"
                            value={account.balance || ''}
                            onChange={(e) => updateBankroll(account.name, parseFloat(e.target.value) || 0)}
                            className="w-20 pl-4 pr-1 py-1 bg-slate-50 border border-slate-200 rounded-lg text-right font-mono font-bold text-slate-800 text-sm focus:outline-none focus:border-coral-400 focus:ring-2 focus:ring-coral-100 transition-all"
                            placeholder="0"
                        />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CLOUD SYNC SECTION */}
          <div className="mt-6 pt-4 border-t border-slate-200">
             <button 
                onClick={() => setShowSync(!showSync)}
                className="flex items-center justify-between w-full text-left text-slate-600 font-bold text-xs mb-2 p-1 hover:bg-slate-50 rounded"
             >
                <span className="flex items-center gap-2">☁️ Cross-Device Sync</span>
                <span className="text-slate-400">{showSync ? '▲' : '▼'}</span>
             </button>
             
             {showSync && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-sm">
                    <p className="text-slate-500 mb-3 text-[10px] leading-relaxed">
                        To access your data on another device, copy your ID below and paste it on the new device.
                    </p>
                    
                    <div className="mb-3">
                        <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Your Current ID</label>
                        <div className="flex gap-2">
                            <code className="flex-1 bg-white border border-slate-200 p-1.5 rounded-lg font-mono text-[10px] text-slate-700 overflow-hidden text-ellipsis">
                                {userId}
                            </code>
                            <button onClick={handleCopyId} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-2 rounded-lg text-[10px] font-bold">
                                Copy
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Load ID from another device</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={inputUserId}
                                onChange={(e) => setInputUserId(e.target.value)}
                                placeholder="Paste ID here..."
                                className="flex-1 border border-slate-200 p-1.5 rounded-lg text-[10px] focus:ring-2 focus:ring-coral-200 outline-none"
                            />
                            <button 
                                onClick={handleLoadUser}
                                disabled={inputUserId.length < 5}
                                className="bg-slate-800 hover:bg-slate-900 text-white px-3 rounded-lg text-[10px] font-bold disabled:opacity-50"
                            >
                                Load
                            </button>
                        </div>
                    </div>
                </div>
             )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 shrink-0">
            <button 
                onClick={onClose}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl transition-all shadow-md text-sm"
            >
                Done
            </button>
        </div>
      </div>
    </div>
  );
};
