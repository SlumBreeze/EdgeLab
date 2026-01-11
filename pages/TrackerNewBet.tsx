
import React from 'react';
import { DraftBet } from '../types/draftBet';
import { BetForm } from '../components/tracker/BetForm';
import { useGameContext } from '../hooks/useGameContext';
import { BookBalanceDisplay, Bet } from '../types';
import { calculateBookBalances } from '../utils/calculations';

interface Props {
  draftBet: DraftBet | null;
  onBack: () => void;
  onBetAdded: (bet: Bet) => void;
}

export default function TrackerNewBet({ draftBet, onBack, onBetAdded }: Props) {
  const { totalBankroll, bankroll, queue } = useGameContext();

  // We need to convert EdgeLab bankroll to Tracker book balances
  const bookBalances: BookBalanceDisplay[] = bankroll.map(acc => ({
    sportsbook: acc.name,
    deposited: acc.balance, // This is a simplification
    currentBalance: acc.balance
  }));

  const handleAddBet = (betData: any) => {
    onBetAdded(betData);
    // After adding, we might want to go back or to the tracker dashboard
    onBack(); 
  };

  return (
    <div className="h-full overflow-y-auto p-4 bg-ink-base">
      <div className="max-w-lg mx-auto pb-24">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-text mb-1">Confirm Bet</h1>
            <p className="text-ink-text/60 text-sm">Review analysis and log to bankroll</p>
          </div>
          <button 
            onClick={onBack}
            className="px-4 py-2 bg-white border border-ink-gray rounded-xl text-xs font-bold text-ink-text/60 hover:text-ink-text transition-all"
          >
            Cancel
          </button>
        </header>

        <div className="space-y-6">
          {draftBet && (
            <div className="bg-white border border-ink-gray p-4 rounded-2xl shadow-sm">
                <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] font-bold text-ink-accent uppercase tracking-widest">{draftBet.sport} Analysis</span>
                    {draftBet.evPct !== null && (
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            +{draftBet.evPct}¢ Edge
                        </span>
                    )}
                </div>
                <h3 className="font-bold text-ink-text text-lg mb-1">{draftBet.homeTeam} vs {draftBet.awayTeam}</h3>
                <p className="text-ink-text/60 text-xs mb-3 italic">"{draftBet.rationale}"</p>
            </div>
          )}

          <BetForm 
            onAddBet={handleAddBet}
            currentBalance={totalBankroll}
            bookBalances={bookBalances}
            draftBet={draftBet}
          />
        </div>
      </div>
    </div>
  );
}
