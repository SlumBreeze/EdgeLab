
import React, { useState } from 'react';
import { useGameContext } from '../hooks/useGameContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BankrollModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { bankroll, updateBankroll, totalBankroll, unitSizePercent, setUnitSizePercent, userId, setUserId, saveNow } = useGameContext() as any;
  const [inputUserId, setInputUserId] = useState('');
  const [showSync, setShowSync] = useState(false);

  if (!isOpen) return null;

  const handleClose = async () => {
    // Force a save immediately before closing modal
    await saveNow();
    onClose();
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(userId);
    alert("Sync ID copied! Paste this on your other device.");
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?sync_id=${userId}`;
    navigator.clipboard.writeText(url);
    alert("Magic Link copied! Open this URL on your new device to auto-login.");
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
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} />
      
      {/* Modal - Reduced Height to 70vh */}
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[70vh]">
        {/* Header - More Compact */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <h2 className="text-sm font-bold text-slate-800">Bankroll</h2>
          </div>
          <button 
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors text-xs"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {/* Total Summary - Compacted */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg p-3 text-white shadow-lg mb-3">
            <div className="flex justify-between items-start">
                <div>
                    <div className="text-[9px] opacity-70 uppercase tracking-wider font-bold">Total Bankroll</div>
                    <div className="text-xl font-bold leading-tight">${totalBankroll.toFixed(2)}</div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] opacity-70 mb-1">Unit Size</div>
                    <div className="flex bg-slate-900/50 rounded-md p-0.5 gap-0.5">
                        {[1, 2, 3, 5].map(pct => (
                            <button
                                key={pct}
                                onClick={() => setUnitSizePercent(pct)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
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
            </div>
            <div className="mt-2 pt-2 border-t border-white/10 text-[9px] opacity-60">
                1 Unit = ${(totalBankroll * (unitSizePercent/100)).toFixed(2)}
            </div>
          </div>

          {/* Book List - Dense */}
          <div className="space-y-1.5">
            {bankroll.map((account: any) => {
              const percent = totalBankroll > 0 ? (account.balance / totalBankroll) * 100 : 0;
              
              return (
                <div key={account.name} className="flex items-center gap-2 bg-white border border-slate-100 p-1.5 rounded-lg hover:border-slate-300 transition-colors">
                  <div className={`w-0.5 self-stretch rounded-full ${account.color || 'bg-slate-400'}`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-700 text-xs truncate">{account.name}</div>
                    <div className="w-full bg-slate-100 h-0.5 rounded-full mt-1 overflow-hidden">
                        <div 
                            className={`h-full rounded-full ${account.color || 'bg-slate-400'}`} 
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">$</span>
                    <input
                        type="number"
                        value={account.balance || ''}
                        onChange={(e) => updateBankroll(account.name, parseFloat(e.target.value) || 0)}
                        className="w-16 pl-3 pr-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-right font-mono font-bold text-slate-800 text-xs focus:outline-none focus:border-coral-400 focus:ring-1 focus:ring-coral-100"
                        placeholder="0"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* CLOUD SYNC SECTION */}
          <div className="mt-4 pt-3 border-t border-slate-200">
             <button 
                onClick={() => setShowSync(!showSync)}
                className="flex items-center justify-between w-full text-left text-slate-600 font-bold text-[10px] mb-2 p-1 hover:bg-slate-50 rounded"
             >
                <span className="flex items-center gap-1">☁️ Sync Devices</span>
                <span className="text-slate-400">{showSync ? '▲' : '▼'}</span>
             </button>
             
             {showSync && (
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                    <div className="mb-2">
                        <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Your ID</label>
                        <div className="flex gap-1 mb-1.5">
                            <code className="flex-1 bg-white border border-slate-200 p-1 rounded text-[9px] font-mono text-slate-700 truncate">
                                {userId}
                            </code>
                            <button onClick={handleCopyId} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-1.5 rounded text-[9px] font-bold">
                                Copy ID
                            </button>
                        </div>
                        <button onClick={handleCopyLink} className="w-full bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 px-1.5 py-1 rounded text-[9px] font-bold flex items-center justify-center gap-1 transition-colors">
                            <span>🔗</span> Copy Magic Link
                        </button>
                    </div>

                    <div className="border-t border-slate-100 pt-2">
                        <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Load ID</label>
                        <div className="flex gap-1">
                            <input 
                                type="text" 
                                value={inputUserId}
                                onChange={(e) => setInputUserId(e.target.value)}
                                placeholder="Paste ID..."
                                className="flex-1 border border-slate-200 p-1 rounded text-[9px] outline-none"
                            />
                            <button 
                                onClick={handleLoadUser}
                                disabled={inputUserId.length < 5}
                                className="bg-slate-800 hover:bg-slate-900 text-white px-2 rounded text-[9px] font-bold disabled:opacity-50"
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
                onClick={handleClose}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-lg transition-all shadow-sm text-xs"
            >
                Done & Save
            </button>
        </div>
      </div>
    </div>
  );
};
