
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Loader2, 
  Zap,
  LayoutDashboard,
  Plus,
  User 
} from 'lucide-react';

// EdgeLab Context
import { useGameContext } from '../hooks/useGameContext';

// Types & Utils
import { Bet, BetStatus, BankrollState, AdvancedStats, BookDeposit, ScoreMap } from '../types';
import { 
  calculateBankrollStats, 
  calculateAdvancedStats, 
  calculateBankrollHistory, 
  calculateBookBalances, 
  formatCurrency, 
  formatBetPickDisplay,
  inferSportFromBet 
} from '../utils/calculations';
import { fetchDailyScores } from '../utils/scores';

// Components (from ProBet Tracker source, now in components/tracker)
import { StatsCard } from '../components/tracker/StatsCard';
import { BetForm } from '../components/tracker/BetForm';
import { BetList } from '../components/tracker/BetList';
import { ProfitCalendar } from '../components/tracker/ProfitCalendar';
import { BankrollModal as TrackerBankrollModal } from '../components/tracker/TrackerBankrollModal';
import { DataManagementModal } from '../components/tracker/DataManagementModal';
import { AnalyticsDashboard } from '../components/tracker/AnalyticsDashboard';
import { BankrollTrendChart } from '../components/tracker/BankrollTrendChart';
import { supabase } from '../services/supabaseClient';

const Tracker: React.FC = () => {
  // Use Context for Global State (Bankroll/Bets) to ensure header sync
  const {
    bets,
    bookBalances, // This is BookBalanceDisplay[]
    bankrollState: contextBankrollStats,
    bankrollLoading: loading,
    refreshBankroll,
    updateBookDeposit,
    addBet,
    updateBetStatus,
    updateBet,
    deleteBet
  } = useGameContext();

  const [scores, setScores] = useState<ScoreMap>({});
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isBankrollModalOpen, setIsBankrollModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const historyRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Initial Setup Modal Trigger
  useEffect(() => {
    // Only open if loaded and no deposits/bets exist
    if (!loading && contextBankrollStats.startingBalance === 0 && bets.length === 0) {
      setIsBankrollModalOpen(true);
    }
  }, [loading, contextBankrollStats.startingBalance, bets.length]);

  // Score Fetching Loop (Added from ProBet Tracker)
  useEffect(() => {
    const loadScores = async () => {
      if (loading) return;

      const d = new Date();
      const today = d.toISOString().split('T')[0];
      const datesToFetch = new Set<string>();

      // Always fetch today
      datesToFetch.add(today);

      // Fetch ALL bet dates to ensure history has scores
      bets.forEach(b => {
         if (b.date) datesToFetch.add(b.date);
      });

      const newScores: ScoreMap = { ...scores };
      let hasUpdates = false;

      await Promise.all(
        Array.from(datesToFetch).map(async (date) => {
          const daily = await fetchDailyScores(date);
          if (daily && daily.length > 0) {
             newScores[date] = daily;
             hasUpdates = true;
          }
        })
      );

      if (hasUpdates) {
        setScores(newScores);
      }
    };

    // Initial load
    if (!loading) loadScores();

    // Poll every 60s
    const interval = setInterval(loadScores, 60000);
    return () => clearInterval(interval);
  }, [loading, bets]);

  // Derived Stats
  // We re-calculate some here to ensure consistency with ProBet Tracker logic,
  // although Context provides some. Recalculating is cheap.
  const advancedStats: AdvancedStats = useMemo(() => {
    return calculateAdvancedStats(bets);
  }, [bets]);

  const bankrollHistory = useMemo(() => {
    return calculateBankrollHistory(contextBankrollStats.startingBalance, bets);
  }, [contextBankrollStats.startingBalance, bets]);

  const winRate = useMemo(() => {
    const total = contextBankrollStats.wins + contextBankrollStats.losses;
    return total > 0 ? (contextBankrollStats.wins / total) * 100 : 0;
  }, [contextBankrollStats.wins, contextBankrollStats.losses]);

  const netProfit = contextBankrollStats.currentBalance - contextBankrollStats.startingBalance;

  // Handlers
  const handleAddBet = async (betData: Omit<Bet, 'id' | 'createdAt'>) => {
    const newBet: Bet = {
      ...betData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      tags: betData.tags || [],
    };
    await addBet(newBet);
  };

  const handleImportData = async (data: { bets: Bet[], startingBankroll?: number }) => {
    const isCleanState = bets.length === 0;
    if (isCleanState || confirm(`This will import ${data.bets.length} bets. Continue?`)) {
      const processedBets = data.bets.map((b: any) => ({
        ...b,
        sport: (b.sport && b.sport !== 'Other') ? b.sport : inferSportFromBet(b),
        tags: b.tags || []
      }));

      try {
        const { error } = await supabase.from('bets').insert(processedBets);
        if (error) throw error;
        await refreshBankroll();
        alert('Import successful and synced to cloud!');
      } catch (err: any) {
        console.error('Supabase import error:', err.message);
        alert(`Imported locally, but failed to sync to cloud: ${err.message}`);
      }
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-ink-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-ink-accent" size={32} />
        <p className="text-ink-text/60 font-medium font-mono">Loading Performance Data...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-base pb-28 md:pb-20 flex flex-col font-sans text-ink-text">
      <DataManagementModal 
        isOpen={isDataModalOpen}
        onClose={() => setIsDataModalOpen(false)}
        onImport={handleImportData}
        currentData={{ bets, startingBankroll: contextBankrollStats.startingBalance }}
      />

      <TrackerBankrollModal 
        isOpen={isBankrollModalOpen}
        onClose={() => setIsBankrollModalOpen(false)}
        onUpdateBookDeposit={updateBookDeposit}
        bookBalances={bookBalances}
        totalBankroll={contextBankrollStats.currentBalance}
      />

      {/* Internal Header (Sub-header) - Kept consistent with EdgeLab style but using ProBet Tracker elements */}
      <div className="bg-ink-base/80 backdrop-blur-md border-b border-ink-gray sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-ink-accent rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              <BarChart3 size={18} className="text-ink-base fill-current" />
            </div>
            <h2 className="text-lg font-bold text-ink-text tracking-tight">Performance Tracker</h2>
          </div>
          
          <div className="flex items-center gap-4">
               <div className="text-right hidden sm:block">
                 <div className="flex items-center justify-end gap-2">
                    <p className={`font-mono font-bold text-lg leading-none ${ 
                      contextBankrollStats.currentBalance >= contextBankrollStats.startingBalance ? 'text-status-win' : 'text-status-loss'
                    }`}>
                      {formatCurrency(contextBankrollStats.currentBalance)}
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
                  className="p-2 rounded-lg bg-ink-paper border border-ink-gray text-ink-text/60 hover:text-ink-accent hover:border-ink-accent transition-all shadow-sm"
                  title="Settings & Backup"
                >
                  <Settings size={20} />
                </button>
             </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-grow">

          {/* Bento Grid Dashboard */}
          <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[minmax(100px,auto)]">

            {/* Big Box Top Left: Chart */}
            <div className="md:col-span-2 lg:col-span-3 row-span-2 bg-ink-paper rounded-2xl border border-ink-gray shadow-lg p-6 relative overflow-hidden group"> 
               <div className="flex justify-between items-start mb-2 relative z-10">
                  <div>
                    <h2 className="text-lg font-bold text-ink-text flex items-center gap-2">
                      <TrendingUp size={18} className="text-ink-accent" />       
                      Net Profit Trend
                    </h2>
                    <p className="text-xs text-ink-text/60 font-mono mt-1">      
                      {contextBankrollStats.totalBets} Bets • Lifetime PnL: <span className={netProfit >= 0 ? 'text-status-win' : 'text-status-loss'}>{netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}</span>
                    </p>
                  </div>
                  <div className="hidden sm:flex gap-2">
                      <div className="bg-ink-base/50 px-3 py-1 rounded-lg border border-ink-gray">
                         <span className="text-[10px] text-ink-text/40 block uppercase">ROI</span>
                         <span className={`text-sm font-mono font-bold ${contextBankrollStats.roi > 0 ? 'text-status-win' : 'text-ink-text'}`}>{contextBankrollStats.roi.toFixed(1)}%</span>
                      </div>
                  </div>
               </div>

               <div className="h-[280px] w-full mt-4 min-h-[280px]">
                  <BankrollTrendChart data={bankrollHistory} />
               </div>
               {/* Subtle background glow */}
               <div className="absolute -top-20 -right-20 w-64 h-64 bg-ink-accent/5 rounded-full blur-3xl pointer-events-none group-hover:bg-ink-accent/10 transition-colors duration-700"></div>
            </div>

            {/* Tall Box Right: Recent Activity */}
            <div className="md:col-span-1 lg:col-span-1 row-span-2 bg-ink-paper rounded-2xl border border-ink-gray shadow-lg flex flex-col overflow-hidden">      
               <div className="p-4 border-b border-ink-gray bg-ink-base/30 flex justify-between items-center">
                  <h3 className="font-bold text-sm text-ink-text">Recent Activity</h3>
                  <History size={14} className="text-ink-text/40" />
               </div>
               <div className="flex-1 overflow-y-auto p-0 scrollbar-hide">       
                  {bets.slice(0, 10).map((bet, i) => (
                   <div key={bet.id} className="p-3 border-b border-ink-gray/50 hover:bg-ink-base/50 transition-colors flex justify-between items-center group"> 
                       <div className="min-w-0">
                          <p className="text-xs font-bold text-ink-text truncate">{formatBetPickDisplay(bet.pick, bet.matchup)}</p>
                          <p className="text-[10px] text-ink-text/40 truncate">{bet.matchup}</p>
                       </div>
                       <div className="text-right pl-2">
                          <span className={`text-xs font-mono font-bold block ${ 
                            bet.status === BetStatus.WON ? 'text-status-win' :   
                            bet.status === BetStatus.LOST ? 'text-status-loss' : 'text-ink-text/40'
                          }`}>
                            {bet.status === BetStatus.WON ? `+${formatCurrency(bet.potentialProfit)}` :
                             bet.status === BetStatus.LOST ? `-${formatCurrency(bet.wager)}` : bet.status}
                          </span>
                       </div>
                    </div>
                  ))}
                  {bets.length === 0 && (
                    <div className="p-6 text-center text-ink-text/40 text-xs">No bets logged yet.</div>
                  )}
               </div>
               <div className="p-2 border-t border-ink-gray bg-ink-base/30 text-center">
                  <button
                    onClick={() => {
                        setViewMode('list');
                        historyRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-[10px] font-bold text-ink-accent hover:underline"
                  >
                    View All History
                  </button>
               </div>
            </div>

            {/* Small Boxes: Stats Grid */}
            <div className="md:col-span-3 lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
               <StatsCard
                 label="Current Streak"
                 value={`${advancedStats.currentStreak > 0 ? 'W' : 'L'}${Math.abs(advancedStats.currentStreak)}`}
                 subValue={advancedStats.currentStreak > 0 ? 'Hot Streak' : 'Cold Streak'}
                 trend={advancedStats.currentStreak > 0 ? 'up' : 'down'}
                 icon={<Zap size={18} />}
                 highlight={Math.abs(advancedStats.currentStreak) >= 3}
               />
               <StatsCard
                 label="Win Rate"
                 value={`${winRate.toFixed(1)}%`}
                 subValue={`${contextBankrollStats.wins}W - ${contextBankrollStats.losses}L`}  
                 trend={winRate > 52.4 ? 'up' : 'neutral'}
                 icon={<Activity size={18} />}
               />
               <StatsCard
                 label="Avg Odds"
                 value={bets.length > 0 ? (bets.reduce((acc, b) => acc + b.odds, 0) / bets.length).toFixed(0) : '0'}
                 subValue="Mean Price"
                 trend="neutral"
                 icon={<Percent size={18} />}
               />
               <StatsCard
                 label="Total Handle"
                 value={formatCurrency(contextBankrollStats.totalWagered)}
                 subValue={`${bets.filter(b => b.status === BetStatus.PENDING).length} Pending`}
                 trend="neutral"
                 icon={<Wallet size={18} />}
               />
            </div>
          </section>

          {/* Secondary Content: Inputs & Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
              {/* Left Column: Form */}
              <div className="lg:col-span-1" ref={formRef}>
                <div className="sticky top-24 space-y-6">
                  <BetForm 
                    onAddBet={handleAddBet} 
                    currentBalance={contextBankrollStats.currentBalance}
                    bookBalances={bookBalances}
                  />

                  {/* Insight Widgets (Hot/Cold) */}
                  <AnalyticsDashboard stats={advancedStats} bankrollHistory={bankrollHistory} />
                </div>
              </div>

              {/* Right Column: Full List */}
              <div className="lg:col-span-2" ref={historyRef}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-ink-text flex items-center gap-2">
                      <LayoutList size={20} className="text-ink-accent" />       
                      Wager History
                    </h3>
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
                    scores={scores}
                    onUpdateStatus={updateBetStatus}
                    onDelete={deleteBet}
                    onEdit={updateBet}
                  />
                ) : (
                  <ProfitCalendar bets={bets} />
                )}
              </div>
          </div>
      </main>
    </div>
  );
};

export default Tracker;
