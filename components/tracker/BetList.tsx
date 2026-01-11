import React, { useState, useMemo } from 'react';
import { Trash2, TrendingUp, TrendingDown, MinusCircle, Edit2, Save, X, Check, ChevronDown, ChevronRight, Calendar, Filter } from 'lucide-react';
import { Bet, BetStatus, Sportsbook } from '../../types';
import { formatCurrency, formatDate, calculatePotentialProfit } from '../../utils/calculations';
import { SPORTSBOOKS, SPORTSBOOK_THEME, SPORTS } from '../../constants';

interface BetListProps {
  bets: Bet[];
  onUpdateStatus: (id: string, status: BetStatus) => void;
  onDelete: (id: string) => void;
  onEdit: (bet: Bet) => void;
}

interface DateGroup {
  date: string;
  bets: Bet[];
  totalProfit: number;
  wins: number;
  losses: number;
  pushes: number;
}

const getTagColor = (tag: string) => {
  switch(tag) {
    case 'Live': return 'bg-rose-100 text-rose-700 border-rose-200';
    case 'Parlay': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'Boost': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Prop': return 'bg-blue-100 text-blue-700 border-blue-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export const BetList: React.FC<BetListProps> = ({ bets, onUpdateStatus, onDelete, onEdit }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Bet>>({});
  
  // Filter State
  const [filterSport, setFilterSport] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  
  // State to track which date groups are expanded
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => {
    if (bets.length > 0) {
      const uniqueDates = Array.from(new Set(bets.map(b => b.date))) as string[];
      uniqueDates.sort((a, b) => b.localeCompare(a));
      return new Set(uniqueDates.slice(0, 1));
    }
    return new Set();
  });

  const toggleDateGroup = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  // Filter bets before grouping
  const filteredBets = useMemo(() => {
    return bets.filter(bet => {
      const matchesSport = filterSport === 'All' || bet.sport === filterSport;
      const matchesStatus = filterStatus === 'All' || bet.status === filterStatus;
      return matchesSport && matchesStatus;
    });
  }, [bets, filterSport, filterStatus]);

  // Group bets by date and calculate daily stats
  const groupedBets = useMemo(() => {
    const groups: Record<string, DateGroup> = {};

    filteredBets.forEach(bet => {
      if (!groups[bet.date]) {
        groups[bet.date] = {
          date: bet.date,
          bets: [],
          totalProfit: 0,
          wins: 0,
          losses: 0,
          pushes: 0
        };
      }
      groups[bet.date].bets.push(bet);
      
      // Calculate daily stats
      if (bet.status === BetStatus.WON) {
        groups[bet.date].totalProfit += bet.potentialProfit;
        groups[bet.date].wins++;
      } else if (bet.status === BetStatus.LOST) {
        groups[bet.date].totalProfit -= bet.wager;
        groups[bet.date].losses++;
      } else if (bet.status === BetStatus.PUSH) {
        groups[bet.date].pushes++;
      }
    });

    // Convert to array and sort by date descending (newest first)
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBets]);


  const handleStartEdit = (bet: Bet) => {
    setDeleteConfirmId(null);
    setEditingId(bet.id);
    setEditForm({ ...bet });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = () => {
    if (editingId && editForm.wager && editForm.odds) {
      const updatedProfit = calculatePotentialProfit(Number(editForm.wager), Number(editForm.odds));
      onEdit({
        ...editForm as Bet,
        potentialProfit: updatedProfit,
        wager: Number(editForm.wager),
        odds: Number(editForm.odds),
      });
      setEditingId(null);
      setEditForm({});
    }
  };

  const handleInputChange = (field: keyof Bet, value: any) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getRowStyle = (book: Sportsbook) => {
    const theme = SPORTSBOOK_THEME[book] || SPORTSBOOK_THEME[Sportsbook.OTHER];
    // Keep solid accent bar but on light bg
    return {
      backgroundColor: '#FFFFFF', // White base
      borderLeft: `4px solid ${theme.bg}`
    };
  };

  const getBookTextColor = (book: Sportsbook) => {
    const theme = SPORTSBOOK_THEME[book] || SPORTSBOOK_THEME[Sportsbook.OTHER];
    // On light background, the brand color usually works well as text too
    return theme.bg;
  };

  if (bets.length === 0) {
    return (
      <div className="bg-ink-paper/50 backdrop-blur-sm rounded-xl border border-ink-gray p-12 text-center shadow-sm">
        <div className="inline-flex p-4 rounded-full bg-white text-ink-text/60 mb-4 shadow-sm border border-ink-gray/20">
          <Calendar size={32} />
        </div>
        <h3 className="text-xl font-bold text-ink-text mb-2">No Bets Tracked Yet</h3>
        <p className="text-ink-text/60 max-w-sm mx-auto">
          Start by adding your first wager in the form above to build your bankroll history.
        </p>
      </div>
    );
  }

  const isFiltering = filterSport !== 'All' || filterStatus !== 'All';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-ink-text">Recent Activity</h3>
        
        {/* Filter Bar */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterSport}
              onChange={(e) => setFilterSport(e.target.value)}
              className="w-full sm:w-32 bg-ink-paper border border-ink-gray rounded-lg py-1.5 pl-3 pr-8 text-xs font-medium text-ink-text focus:border-ink-accent focus:outline-none appearance-none cursor-pointer"
            >
              <option value="All">All Sports</option>
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-text/40 pointer-events-none" />
          </div>

          <div className="relative flex-1 sm:flex-none">
             <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full sm:w-32 bg-ink-paper border border-ink-gray rounded-lg py-1.5 pl-3 pr-8 text-xs font-medium text-ink-text focus:border-ink-accent focus:outline-none appearance-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              {Object.values(BetStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-text/40 pointer-events-none" />
          </div>

          {isFiltering && (
            <button
              onClick={() => { setFilterSport('All'); setFilterStatus('All'); }}
              className="p-1.5 rounded-lg bg-ink-gray/20 text-ink-text/60 hover:text-ink-text hover:bg-ink-gray/40 transition-colors"
              title="Clear Filters"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {isFiltering && filteredBets.length === 0 ? (
         <div className="bg-ink-paper/50 backdrop-blur-sm rounded-xl border border-ink-gray p-8 text-center shadow-sm">
            <div className="inline-flex p-3 rounded-full bg-ink-base text-ink-text/40 mb-3">
              <Filter size={24} />
            </div>
            <p className="text-ink-text font-medium">No matching bets found</p>
            <p className="text-ink-text/60 text-xs mt-1">Try adjusting your filters or clear them to see all bets.</p>
            <button 
              onClick={() => { setFilterSport('All'); setFilterStatus('All'); }}
              className="mt-4 text-xs font-bold text-ink-accent hover:underline"
            >
              Clear Filters
            </button>
         </div>
      ) : (
        <>
          {/* DESKTOP VIEW (Table) */}
          <div className="hidden md:block bg-ink-paper/50 backdrop-blur-sm rounded-xl border border-ink-gray overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse table-fixed md:table-auto">
              <thead>
                <tr className="bg-ink-base/50 border-b border-ink-gray text-xs uppercase text-ink-text/60 font-semibold tracking-wider">
                  <th className="px-4 py-3 w-1/3 md:w-auto">Matchup / Pick</th>
                  <th className="px-4 py-3 hidden sm:table-cell w-28">Sportsbook</th>
                  <th className="px-4 py-3 text-right w-20">Odds</th>
                  <th className="px-4 py-3 text-right w-24">Wager</th>
                  <th className="px-4 py-3 text-center w-28">Result</th>
                  <th className="px-4 py-3 text-right w-20">Actions</th>
                </tr>
              </thead>
              
              {groupedBets.map((group) => {
                const isExpanded = expandedDates.has(group.date);
                const dateProfitClass = group.totalProfit > 0 ? 'text-status-win' : group.totalProfit < 0 ? 'text-status-loss' : 'text-ink-text/40';

                return (
                  <tbody key={group.date} className="border-b border-ink-gray last:border-b-0">
                    {/* Group Header */}
                    <tr 
                      className="bg-ink-base/30 hover:bg-ink-base/50 cursor-pointer transition-colors"
                      onClick={() => toggleDateGroup(group.date)}
                    >
                      <td colSpan={6} className="px-4 py-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? <ChevronDown size={16} className="text-ink-text/40" /> : <ChevronRight size={16} className="text-ink-text/40" />}
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-ink-accent" />
                              <span className="text-sm font-bold text-ink-text">{formatDate(group.date)}</span>
                              <span className="text-xs text-ink-text/60 font-medium ml-2">
                                {group.bets.length} Bet{group.bets.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-medium">
                            <span className="text-ink-text/60 hidden sm:inline">
                              {group.wins}W - {group.losses}L - {group.pushes}P
                            </span>
                            <span className={`font-mono ${dateProfitClass}`}>
                              {group.totalProfit > 0 ? '+' : ''}{formatCurrency(group.totalProfit)}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Bet Rows */}
                    {isExpanded && group.bets.map((bet) => {
                      const isEditing = editingId === bet.id;
                      const isDeleting = deleteConfirmId === bet.id;
                      const rowStyle = !isEditing ? getRowStyle(bet.sportsbook) : {};

                      return (
                        <tr 
                          key={bet.id} 
                          style={rowStyle}
                          className={`group transition-all border-t border-ink-gray ${!isEditing ? 'hover:bg-ink-base/50' : 'bg-ink-paper'}`}
                        >
                          {isEditing ? (
                            // Edit Mode
                            <>
                              <td className="px-4 py-2 align-top pl-4">
                                <div className="flex flex-col gap-2">
                                  <input 
                                    type="text" 
                                    placeholder="Matchup"
                                    value={editForm.matchup}
                                    onChange={(e) => handleInputChange('matchup', e.target.value)}
                                    className="bg-white border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-full focus:border-ink-accent outline-none" 
                                  />
                                  <input 
                                    type="text" 
                                    placeholder="Pick"
                                    value={editForm.pick}
                                    onChange={(e) => handleInputChange('pick', e.target.value)}
                                    className="bg-white border border-ink-gray rounded px-2 py-1 text-ink-text/80 text-xs w-full focus:border-ink-accent outline-none" 
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2 align-top hidden sm:table-cell">
                                <select 
                                  value={editForm.sportsbook} 
                                  onChange={(e) => handleInputChange('sportsbook', e.target.value)}
                                  className="bg-white border border-ink-gray rounded px-2 py-1 text-ink-text/80 text-xs w-full focus:border-ink-accent outline-none"
                                >
                                  {SPORTSBOOKS.map(sb => (
                                    <option key={sb} value={sb}>{sb}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2 align-top text-right">
                                <input 
                                  type="number" 
                                  value={editForm.odds}
                                  onChange={(e) => handleInputChange('odds', Number(e.target.value))}
                                  className="bg-white border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-20 ml-auto text-right focus:border-ink-accent outline-none font-mono" 
                                />
                              </td>
                              <td className="px-4 py-2 align-top text-right">
                                <input 
                                  type="number" 
                                  min="0"
                                  step="0.01"
                                  value={editForm.wager}
                                  onChange={(e) => handleInputChange('wager', Number(e.target.value))}
                                  className="bg-white border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-20 ml-auto text-right focus:border-ink-accent outline-none" 
                                />
                              </td>
                              <td className="px-4 py-2 text-center align-middle">
                                <span className="text-xs text-ink-text/60 italic">Editing...</span>
                              </td>
                              <td className="px-4 py-2 text-right align-top">
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={handleSaveEdit}
                                    className="p-1.5 rounded bg-ink-accent/10 text-ink-accent hover:bg-ink-accent/20 transition-colors"
                                    title="Save Changes"
                                  >
                                    <Save size={14} />
                                  </button>
                                  <button 
                                    onClick={handleCancelEdit}
                                    className="p-1.5 rounded bg-white border border-ink-gray text-ink-text/60 hover:text-ink-text hover:bg-gray-50 transition-colors"
                                    title="Cancel"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            // Display Mode
                            <>
                              <td className="px-4 py-2 align-top">
                                <div className="flex flex-col items-start">
                                  <span className="text-ink-text font-medium text-sm leading-tight break-words">{bet.matchup}</span>
                                  <span className="text-ink-text/60 text-xs leading-tight break-words mt-1">{bet.pick}</span>
                                  {bet.tags && bet.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {bet.tags.map(tag => (
                                        <span key={tag} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getTagColor(tag)}`}>
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  <div className="sm:hidden mt-1.5">
                                    <span 
                                      className="text-[10px] font-bold uppercase tracking-wider"
                                      style={{ color: getBookTextColor(bet.sportsbook) }}
                                    >
                                      {bet.sportsbook}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2 align-top hidden sm:table-cell">
                                <span 
                                  className="text-[11px] font-bold tracking-wide"
                                  style={{ color: getBookTextColor(bet.sportsbook) }}
                                >
                                  {bet.sportsbook}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-ink-text align-top">
                                {bet.odds > 0 ? `+${bet.odds}` : bet.odds}
                              </td>
                              <td className="px-4 py-2 text-right align-top">
                                <div className="flex flex-col items-end">
                                  <span className="text-ink-text font-medium text-sm whitespace-nowrap">{formatCurrency(bet.wager)}</span>
                                  <span className="text-status-win text-[10px] whitespace-nowrap">To Win: {formatCurrency(bet.potentialProfit)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-center align-top">
                                <div className="flex flex-wrap justify-center gap-1">
                                  {bet.status === BetStatus.PENDING ? (
                                    <>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onUpdateStatus(bet.id, BetStatus.WON); }}
                                        className="p-1 rounded bg-white text-ink-text/40 hover:bg-status-win hover:text-white transition-colors border border-ink-gray"
                                        title="Mark Won"
                                      >
                                        <TrendingUp size={12} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onUpdateStatus(bet.id, BetStatus.LOST); }}
                                        className="p-1 rounded bg-white text-ink-text/40 hover:bg-status-loss hover:text-white transition-colors border border-ink-gray"
                                        title="Mark Lost"
                                      >
                                        <TrendingDown size={12} />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); onUpdateStatus(bet.id, BetStatus.PUSH); }}
                                        className="p-1 rounded bg-white text-ink-text/40 hover:bg-ink-text/60 hover:text-white transition-colors border border-ink-gray"
                                        title="Mark Push"
                                      >
                                        <MinusCircle size={12} />
                                      </button>
                                    </>
                                  ) : (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                      bet.status === BetStatus.WON ? 'bg-status-win/10 text-status-win border-status-win/20' :
                                      bet.status === BetStatus.LOST ? 'bg-status-loss/10 text-status-loss border-status-loss/20' :
                                      'bg-white text-ink-text/60 border-ink-gray'
                                    }`}>
                                      {bet.status}
                                    </span>
                                  )}
                                </div>
                                {bet.status !== BetStatus.PENDING && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); onUpdateStatus(bet.id, BetStatus.PENDING); }}
                                    className="text-[10px] text-ink-text/40 hover:text-ink-text mt-1 block w-full text-center"
                                  >
                                    Undo
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right align-top">
                                {isDeleting ? (
                                  <div className="flex justify-end gap-1.5 items-center">
                                    <button 
                                      onClick={() => {
                                        onDelete(bet.id);
                                        setDeleteConfirmId(null);
                                      }}
                                      className="p-1 rounded bg-status-loss/10 text-status-loss hover:bg-status-loss hover:text-white transition-colors border border-status-loss/20"
                                      title="Confirm Delete"
                                    >
                                      <Check size={12} />
                                    </button>
                                    <button 
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="p-1 rounded bg-white text-ink-text/40 hover:bg-gray-50 border border-ink-gray transition-colors"
                                      title="Cancel"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => handleStartEdit(bet)}
                                      className="text-ink-text/40 hover:text-ink-accent transition-all p-1.5"
                                      title="Edit Bet"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setEditingId(null);
                                        setDeleteConfirmId(bet.id);
                                      }}
                                      className="text-ink-text/40 hover:text-status-loss transition-colors p-1.5"
                                      title="Delete Bet"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>

          {/* MOBILE VIEW (Cards) */}
          <div className="md:hidden space-y-6">
            {groupedBets.map((group) => {
              const isExpanded = expandedDates.has(group.date);
              const dateProfitClass = group.totalProfit > 0 ? 'text-status-win' : group.totalProfit < 0 ? 'text-status-loss' : 'text-ink-text/40';

              return (
                <div key={group.date} className="space-y-3">
                  {/* Mobile Group Header */}
                  <div 
                    onClick={() => toggleDateGroup(group.date)}
                    className="flex items-center justify-between p-3 bg-ink-base/50 border border-ink-gray rounded-lg active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown size={16} className="text-ink-text/40" /> : <ChevronRight size={16} className="text-ink-text/40" />}
                        <div>
                          <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-ink-accent" />
                              <span className="text-sm font-bold text-ink-text">{formatDate(group.date)}</span>
                          </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className={`font-mono text-sm font-bold ${dateProfitClass}`}>
                          {group.totalProfit > 0 ? '+' : ''}{formatCurrency(group.totalProfit)}
                        </p>
                        <p className="text-[10px] text-ink-text/60 font-medium">
                          {group.wins}W - {group.losses}L
                        </p>
                    </div>
                  </div>

                  {/* Mobile Bets List */}
                  {isExpanded && (
                    <div className="space-y-3 pl-2">
                      {group.bets.map(bet => {
                          const isEditing = editingId === bet.id;
                          const isDeleting = deleteConfirmId === bet.id;
                          const theme = SPORTSBOOK_THEME[bet.sportsbook] || SPORTSBOOK_THEME[Sportsbook.OTHER];
                          
                          if (isEditing) {
                            return (
                              <div key={bet.id} className="bg-ink-paper p-4 rounded-xl border border-ink-accent shadow-md space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                {/* Edit Inputs Mobile */}
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-ink-text/40">Matchup</label>
                                    <input 
                                      type="text" 
                                      value={editForm.matchup}
                                      onChange={(e) => handleInputChange('matchup', e.target.value)}
                                      className="w-full bg-white border border-ink-gray rounded p-2 text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase font-bold text-ink-text/40">Pick</label>
                                      <input 
                                        type="text" 
                                        value={editForm.pick}
                                        onChange={(e) => handleInputChange('pick', e.target.value)}
                                        className="w-full bg-white border border-ink-gray rounded p-2 text-sm"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase font-bold text-ink-text/40">Sportsbook</label>
                                      <select 
                                          value={editForm.sportsbook} 
                                          onChange={(e) => handleInputChange('sportsbook', e.target.value)}
                                          className="w-full bg-white border border-ink-gray rounded p-2 text-sm"
                                        >
                                          {SPORTSBOOKS.map(sb => (
                                            <option key={sb} value={sb}>{sb}</option>
                                          ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase font-bold text-ink-text/40">Odds</label>
                                      <input 
                                        type="number" 
                                        value={editForm.odds}
                                        onChange={(e) => handleInputChange('odds', Number(e.target.value))}
                                        className="w-full bg-white border border-ink-gray rounded p-2 text-sm font-mono text-right"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] uppercase font-bold text-ink-text/40">Wager</label>
                                      <input 
                                        type="number" 
                                        value={editForm.wager}
                                        onChange={(e) => handleInputChange('wager', Number(e.target.value))}
                                        className="w-full bg-white border border-ink-gray rounded p-2 text-sm font-mono text-right"
                                      />
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={handleSaveEdit} className="flex-1 bg-ink-accent text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                                      <Save size={16} /> Save
                                    </button>
                                    <button onClick={handleCancelEdit} className="flex-1 bg-white border border-ink-gray text-ink-text py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                                      <X size={16} /> Cancel
                                    </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={bet.id} className="relative bg-ink-paper/50 rounded-xl border border-ink-gray shadow-sm overflow-hidden active:bg-ink-paper transition-colors">
                              {/* Color Strip */}
                              <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: theme.bg }}></div>
                              
                              <div className="pl-5 pr-4 py-4 space-y-3">
                                  {/* Header */}
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="text-xs font-bold text-ink-text/40 uppercase mb-0.5">{bet.sport} • <span style={{ color: theme.bg }}>{bet.sportsbook}</span></p>
                                      <h4 className="font-bold text-ink-text text-sm leading-tight">{bet.matchup}</h4>
                                      {bet.tags && bet.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {bet.tags.map(tag => (
                                            <span key={tag} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getTagColor(tag)}`}>
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-mono font-bold text-ink-text bg-white px-2 py-1 rounded border border-ink-gray/50 text-xs shadow-sm">
                                        {bet.odds > 0 ? `+${bet.odds}` : bet.odds}
                                    </span>
                                  </div>

                                  {/* Details */}
                                  <div className="grid grid-cols-2 gap-4 py-3 border-t border-b border-ink-gray/30 border-dashed">
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-ink-text/40 mb-1">Pick</p>
                                        <p className="text-sm font-medium text-ink-text leading-tight">{bet.pick}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase font-bold text-ink-text/40 mb-1">Wager / Profit</p>
                                        <p className="text-sm font-medium text-ink-text">
                                          {formatCurrency(bet.wager)}
                                          <span className="text-ink-text/30 mx-1">→</span>
                                          <span className="text-status-win">{formatCurrency(bet.potentialProfit)}</span>
                                        </p>
                                    </div>
                                  </div>
                                  
                                  {/* Actions */}
                                  <div className="flex items-center justify-between pt-1">
                                    {bet.status === BetStatus.PENDING ? (
                                      <div className="flex gap-2">
                                          <button 
                                            onClick={() => onUpdateStatus(bet.id, BetStatus.WON)}
                                            className="w-10 h-10 rounded-lg flex items-center justify-center border border-status-win/30 bg-status-win/5 text-status-win active:bg-status-win active:text-white transition-colors"
                                          >
                                            <TrendingUp size={18} />
                                          </button>
                                          <button 
                                            onClick={() => onUpdateStatus(bet.id, BetStatus.LOST)}
                                            className="w-10 h-10 rounded-lg flex items-center justify-center border border-status-loss/30 bg-status-loss/5 text-status-loss active:bg-status-loss active:text-white transition-colors"
                                          >
                                            <TrendingDown size={18} />
                                          </button>
                                          <button 
                                            onClick={() => onUpdateStatus(bet.id, BetStatus.PUSH)}
                                            className="w-10 h-10 rounded-lg flex items-center justify-center border border-ink-gray bg-white text-ink-text/60 active:bg-ink-text active:text-white transition-colors"
                                          >
                                            <MinusCircle size={18} />
                                          </button>
                                      </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold border ${
                                              bet.status === BetStatus.WON ? 'bg-status-win/10 text-status-win border-status-win/20' :
                                              bet.status === BetStatus.LOST ? 'bg-status-loss/10 text-status-loss border-status-loss/20' :
                                              'bg-white text-ink-text/60 border-ink-gray'
                                            }`}>
                                              {bet.status}
                                          </span>
                                          <button onClick={() => onUpdateStatus(bet.id, BetStatus.PENDING)} className="text-xs text-ink-text/40 underline p-2">Undo</button>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-1">
                                        {isDeleting ? (
                                          <div className="flex items-center bg-status-loss/10 rounded-lg p-1 animate-in slide-in-from-right duration-200">
                                            <button onClick={() => onDelete(bet.id)} className="p-2 text-status-loss bg-white rounded shadow-sm mr-1"><Check size={16} /></button>
                                            <button onClick={() => setDeleteConfirmId(null)} className="p-2 text-ink-text/60"><X size={16} /></button>
                                          </div>
                                        ) : (
                                          <>
                                            <button onClick={() => handleStartEdit(bet)} className="p-2 text-ink-text/40 hover:text-ink-accent"><Edit2 size={16} /></button>
                                            <button onClick={() => setDeleteConfirmId(bet.id)} className="p-2 text-ink-text/40 hover:text-status-loss"><Trash2 size={16} /></button>
                                          </>
                                        )}
                                    </div>
                                  </div>
                              </div>
                            </div>
                          );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
