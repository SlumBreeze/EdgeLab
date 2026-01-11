import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, 
  TrendingUp, 
  Percent, 
  BarChart3, 
  Activity, 
  Settings, 
  History, 
  Edit2, 
  LayoutList, 
  Calendar, 
  Loader2 
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { 
  Bet, 
  BetStatus, 
  BankrollState, 
  AdvancedStats, 
  Sportsbook, 
  BookDeposit 
} from '../types';
import { 
  calculateBankrollStats, 
  calculateAdvancedStats, 
  calculateBankrollHistory, 
  calculateBookBalances, 
  formatCurrency, 
  inferSportFromBet 
} from '../utils/calculations';

// Components (updated paths)
import { StatsCard } from '../components/tracker/StatsCard';
import { BetForm } from '../components/tracker/BetForm';
import { BetList } from '../components/tracker/BetList';
import { ProfitCalendar } from '../components/tracker/ProfitCalendar';
import { BankrollModal as TrackerBankrollModal } from '../components/tracker/TrackerBankrollModal';
import { DataManagementModal } from '../components/tracker/DataManagementModal';
import { AnalyticsDashboard } from '../components/tracker/AnalyticsDashboard';
import { useGameContext } from '../hooks/useGameContext';

const Tracker: React.FC = () => {
  const {
    bets,
    bookBalances,
    bankrollState: bankrollStats,
    bankrollLoading: loading,
    refreshBankroll: refresh,
    updateBookDeposit,
    addBet,
    updateBetStatus,
    updateBet,
    deleteBet
  } = useGameContext();

  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isBankrollModalOpen, setIsBankrollModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Initial Setup Modal Trigger
  useEffect(() => {
    // Smart Modal Logic: Only open if loaded and no deposits/bets exist
    if (!loading && bankrollStats.startingBalance === 0 && bets.length === 0) {
      setIsBankrollModalOpen(true);
    }
  }, [loading, bankrollStats.startingBalance, bets.length]);

  const advancedStats: AdvancedStats = useMemo(() => {
    return calculateAdvancedStats(bets);
  }, [bets]);

  const bankrollHistory = useMemo(() => {
    return calculateBankrollHistory(bankrollStats.startingBalance, bets);
  }, [bankrollStats.startingBalance, bets]);

  // Wrappers for Context Actions to match component signatures if needed
  // (Most components can take the context functions directly if signatures match, 
  // but we'll wrap to be safe and consistent with previous code)

  const handleAddBet = async (betData: Omit<Bet, 'id' | 'createdAt'>) => {
    const newBet: Bet = {
      ...betData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      tags: betData.tags || [],
    };
    await addBet(newBet);
  };

  const handleUpdateStatus = async (id: string, status: BetStatus) => {
    await updateBetStatus(id, status);
  };

  const handleEditBet = async (updatedBet: Bet) => {
    await updateBet(updatedBet);
  };

  const handleDeleteBet = async (id: string) => {
    await deleteBet(id);
  };

  const handleImportData = async (data: { bets: Bet[], startingBankroll?: number }) => {
    const isCleanState = bets.length === 0;
    if (isCleanState || confirm(`This will import ${data.bets.length} bets. Continue?`)) {
      const processedBets = data.bets.map((b: any) => ({
        ...b,
        sport: (b.sport && b.sport !== 'Other') ? b.sport : inferSportFromBet(b),
        sportsbook: b.sportsbook === 'ESPN Bet' ? Sportsbook.THESCOREBET : b.sportsbook,
        tags: b.tags || []
      }));

      try {
        const { error } = await supabase.from('bets').insert(processedBets);
        if (error) throw error;
        await refresh();
        alert('Import successful and synced to cloud!');
      } catch (err: any) {
        console.error('Supabase import error:', err.message);
        alert(`Imported locally, but failed to sync to cloud: ${err.message}`);
      }
    }
  };

  if (loading) return (
    <div className="flex-1 bg-ink-base flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-ink-accent" size={32} />
        <p className="text-ink-text/60 font-medium">Loading your betting history...</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 bg-ink-base pb-10 flex flex-col font-sans">
      <DataManagementModal 
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        onImport={handleImportData}
        currentData={{ bets, startingBankroll: bankrollStats.startingBalance }}
      />

      <TrackerBankrollModal 
        isOpen={isBankrollModalOpen}
        onClose={() => setIsBankrollModalOpen(false)}
        onUpdateBookDeposit={updateBookDeposit}
        bookBalances={bookBalances}
        totalBankroll={bankrollStats.currentBalance}
      />

      {/* Internal Header (Sub-header) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full flex items-center justify-between border-b border-ink-gray/30 mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink-text tracking-tight">Performance Tracker</h2>
            {loading && <Loader2 size={14} className="animate-spin text-ink-text/40 ml-2" />}
          </div>
          
          <div className="flex items-center gap-4">
               <div className="text-right hidden sm:block">
                 <div className="flex items-center justify-end gap-2">
                    <p className={`font-mono font-bold text-lg leading-none ${ 
                      bankrollStats.currentBalance >= bankrollStats.startingBalance ? 'text-status-win' : 'text-status-loss'
                    }`}>
                      {formatCurrency(bankrollStats.currentBalance)}
                    </p>
                    <button 
                      onClick={() => setIsBankrollModalOpen(true)}
                      className="p-1 rounded-md text-ink-text/40 hover:text-ink-accent hover:bg-ink-accent/10 transition-all flex items-center gap-1"
                      title="Manage Books"
                    >
                      <Edit2 size={14} />
                    </button>
                 </div>
               </div>
             
             <div className="w-px h-8 bg-ink-gray hidden sm:block"></div>

             <div className="flex gap-2">
                <button
                  onClick={() => setIsDataModalOpen(true)}
                  className="p-2 rounded-lg bg-white border border-ink-gray text-ink-text/60 hover:text-ink-accent hover:border-ink-accent transition-all shadow-sm"
                  title="Settings & Backup"
                >
                  <Settings size={20} />
                </button>
             </div>
          </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 flex-grow">
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatsCard 
                label="Total Bankroll" 
                value={formatCurrency(bankrollStats.currentBalance)}
                subValue={`${bankrollStats.currentBalance >= bankrollStats.startingBalance ? '+' : ''}${formatCurrency(bankrollStats.currentBalance - bankrollStats.startingBalance)} Net`}
                trend={bankrollStats.currentBalance >= bankrollStats.startingBalance ? 'up' : 'down'}
                icon={<Wallet size={20} />}
                highlight
              />
              <StatsCard 
                label="Actual ROI" 
                value={`${bankrollStats.roi.toFixed(2)}%`}
                subValue="Money Weighted"
                trend={bankrollStats.roi > 0 ? 'up' : bankrollStats.roi < 0 ? 'down' : 'neutral'}
                icon={<Percent size={20} />}
              />
              <StatsCard 
                label="Flat ROI" 
                value={`${bankrollStats.flatROI.toFixed(2)}%`}
                subValue="Unit Weighted (Skill)"
                trend={bankrollStats.flatROI > 0 ? 'up' : bankrollStats.flatROI < 0 ? 'down' : 'neutral'}
                icon={<Activity size={20} />}
              />
              <StatsCard 
                label="Record" 
                value={`${bankrollStats.wins}-${bankrollStats.losses}-${bankrollStats.pushes}`}
                subValue={`${((bankrollStats.wins / (bankrollStats.wins + bankrollStats.losses || 1)) * 100).toFixed(1)}% Win Rate`}
                trend="neutral"
                icon={<History size={20} />}
              />
               <StatsCard 
                label="Total Handle" 
                value={formatCurrency(bankrollStats.totalWagered)}
                subValue={`${bets.filter(b => b.status === BetStatus.PENDING).length} Pending Bets`}
                trend="neutral"
                icon={<BarChart3 size={20} />}
              />
            </div>

            {/* Streak & Analytics Section */}
            <div className="border-t border-ink-gray pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-ink-text flex items-center gap-2">
                  <Activity size={20} className="text-ink-accent" />
                  Performance Analytics
                </h3>
              </div>
              <AnalyticsDashboard stats={advancedStats} bankrollHistory={bankrollHistory} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Form */}
              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <BetForm 
                    onAddBet={handleAddBet} 
                    currentBalance={bankrollStats.currentBalance}
                    bookBalances={bookBalances}
                  />
                  
                  {/* Mini Insight / Tip Box */}
                  <div className="mt-6 p-4 rounded-xl border border-ink-gray bg-ink-paper/50 backdrop-blur-sm shadow-sm">
                    <h4 className="text-ink-accent font-bold text-sm mb-2 flex items-center gap-2">
                      <TrendingUp size={14} /> Smart Betting Tip
                    </h4>
                    <p className="text-ink-text/80 text-sm leading-relaxed mb-2">
                      <span className="text-ink-text font-medium">Actual vs. Flat ROI:</span>
                    </p>
                    <ul className="text-xs text-ink-text/60 space-y-1 list-disc pl-4">
                        <li>If <b>Actual {'>'} Flat</b>: Your bet sizing is excellent (you bet more on winning plays).</li>
                        <li>If <b>Flat {'>'} Actual</b>: You are picking well but losing money on big bets. Consider flat betting.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Right Column: List */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-end mb-4">
                    <div className="bg-ink-paper border border-ink-gray rounded-lg p-1 flex gap-1">
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-ink-accent text-white shadow-sm' : 'text-ink-text/60 hover:text-ink-text'}`}
                            title="List View"
                        >
                            <LayoutList size={16} />
                        </button>
                        <button 
                            onClick={() => setViewMode('calendar')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-ink-accent text-white shadow-sm' : 'text-ink-text/40 hover:text-ink-text'}`}
                            title="Calendar View"
                        >
                            <Calendar size={16} />
                        </button>
                    </div>
                </div>

                {viewMode === 'list' ? (
                  <BetList 
                    bets={bets} 
                    onUpdateStatus={handleUpdateStatus} 
                    onDelete={handleDeleteBet}
                    onEdit={handleEditBet}
                  />
                ) : (
                  <ProfitCalendar bets={bets} />
                )}
              </div>
            </div>
          </>
      </main>
    </div>
  );
};

export default Tracker;