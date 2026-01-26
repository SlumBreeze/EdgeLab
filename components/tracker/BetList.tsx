import React, { useState, useMemo } from "react";
import {
  Trash2,
  TrendingUp,
  TrendingDown,
  MinusCircle,
  Edit2,
  Save,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  Filter,
  Clock,
  MoreVertical,
} from "lucide-react";
import { Bet, BetStatus, Sportsbook, ScoreMap } from "../../types";
import {
  formatCurrency,
  formatDate,
  calculatePotentialProfit,
  formatBetPickDisplay,
} from "../../utils/calculations";
import { findMatchingGame } from "../../utils/scores";
import { SPORTSBOOKS, SPORTSBOOK_THEME, SPORTS } from "../../constants";

interface BetListProps {
  bets: Bet[];
  scores?: ScoreMap;
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
  switch (tag) {
    case "Live":
      return "bg-rose-900/40 text-rose-300 border-rose-800/50";
    case "Parlay":
      return "bg-purple-900/40 text-purple-300 border-purple-800/50";
    case "Boost":
      return "bg-amber-900/40 text-amber-300 border-amber-800/50";
    case "Prop":
      return "bg-blue-900/40 text-blue-300 border-blue-800/50";
    default:
      return "bg-ink-gray/40 text-ink-text/80 border-ink-gray";
  }
};

export const BetList: React.FC<BetListProps> = ({
  bets,
  scores,
  onUpdateStatus,
  onDelete,
  onEdit,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Bet>>({});
  const [filterSport, setFilterSport] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [mobileMenuId, setMobileMenuId] = useState<string | null>(null);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => {
    if (bets.length > 0) {
      const uniqueDates = Array.from(
        new Set(bets.map((b) => b.date)),
      ) as string[];
      uniqueDates.sort((a, b) => b.localeCompare(a));
      return new Set(uniqueDates.slice(0, 1));
    }
    return new Set();
  });

  const toggleDateGroup = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const filteredBets = useMemo(() => {
    return bets.filter((bet) => {
      const matchesSport = filterSport === "All" || bet.sport === filterSport;
      const matchesStatus =
        filterStatus === "All" || bet.status === filterStatus;
      return matchesSport && matchesStatus;
    });
  }, [bets, filterSport, filterStatus]);

  const groupedBets = useMemo(() => {
    const groups: Record<string, DateGroup> = {};

    filteredBets.forEach((bet) => {
      if (!groups[bet.date]) {
        groups[bet.date] = {
          date: bet.date,
          bets: [],
          totalProfit: 0,
          wins: 0,
          losses: 0,
          pushes: 0,
        };
      }
      groups[bet.date].bets.push(bet);
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

    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBets]);

  const handleStartEdit = (bet: Bet) => {
    setDeleteConfirmId(null);
    setMobileMenuId(null);
    setEditingId(bet.id);
    setEditForm({ ...bet });
  };

  const handleSaveEdit = () => {
    if (editingId && editForm.wager && editForm.odds) {
      const updatedProfit = calculatePotentialProfit(
        Number(editForm.wager),
        Number(editForm.odds),
      );
      onEdit({
        ...(editForm as Bet),
        potentialProfit: updatedProfit,
        wager: Number(editForm.wager),
        odds: Number(editForm.odds),
      });
      setEditingId(null);
      setEditForm({});
    }
  };

  const getBookTextColor = (book: Sportsbook) => {
    const theme = SPORTSBOOK_THEME[book] || SPORTSBOOK_THEME[Sportsbook.OTHER];
    return theme.bg;
  };

  const renderScore = (bet: Bet) => {
    if (!scores || !scores[bet.date]) return null;
    const game = findMatchingGame(bet, scores[bet.date]);
    if (!game) return null;

    // Only show for In Progress or Final
    if (game.status === "SCHEDULED" || game.status === "POSTPONED") return null;

    const isLive = game.status === "IN_PROGRESS";
    const isFinal = game.status === "FINAL";

    return (
      <div
        className={`flex items-center gap-2 text-xs font-mono ${isLive ? "text-ink-text" : "text-ink-text/60"}`}
      >
        {isLive && (
          <span className="relative flex h-2 w-2 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ink-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-ink-accent"></span>
          </span>
        )}
        {isFinal && (
          <span className="text-[10px] font-bold uppercase text-ink-text/40 mr-1">
            FINAL
          </span>
        )}

        <span className="font-bold whitespace-nowrap">
          {game.awayTeam} {game.awayScore} - {game.homeTeam} {game.homeScore}
        </span>

        {isLive && (
          <span className="text-ink-accent text-[10px] ml-1 whitespace-nowrap">
            {game.clock}
          </span>
        )}
      </div>
    );
  };

  if (bets.length === 0) {
    return (
      <div className="bg-ink-paper rounded-xl border border-dashed border-ink-gray p-12 text-center">
        <h3 className="text-xl font-bold text-ink-text mb-2">
          No Bets Tracked
        </h3>
        <p className="text-ink-text/40 max-w-sm mx-auto">
          Start by adding your first wager above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Filter Bar */}
        <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterSport}
              onChange={(e) => setFilterSport(e.target.value)}
              className="w-full sm:w-32 bg-ink-paper border border-ink-gray rounded-lg py-1.5 pl-3 pr-8 text-xs font-medium text-ink-text focus:border-ink-accent focus:outline-none appearance-none cursor-pointer"
            >
              <option value="All">All Sports</option>
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-text/40 pointer-events-none"
            />
          </div>

          <div className="relative flex-1 sm:flex-none">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full sm:w-32 bg-ink-paper border border-ink-gray rounded-lg py-1.5 pl-3 pr-8 text-xs font-medium text-ink-text focus:border-ink-accent focus:outline-none appearance-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              {Object.values(BetStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-text/40 pointer-events-none"
            />
          </div>

          {(filterSport !== "All" || filterStatus !== "All") && (
            <button
              onClick={() => {
                setFilterSport("All");
                setFilterStatus("All");
              }}
              className="p-1.5 rounded-lg bg-ink-gray text-ink-text/60 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {groupedBets.length === 0 ? (
        <div className="bg-ink-paper rounded-xl border border-ink-gray p-8 text-center">
          <p className="text-ink-text font-medium">No matching bets found</p>
        </div>
      ) : (
        <>
          {/* DESKTOP VIEW */}
          <div className="hidden md:block bg-ink-paper rounded-2xl border border-ink-gray overflow-x-auto shadow-lg">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-ink-base border-b border-ink-gray text-xs uppercase text-ink-text/40 font-semibold tracking-wider">
                  <th className="px-5 py-3 w-1/3 md:w-auto">Matchup / Pick</th>
                  <th className="px-4 py-3 hidden lg:table-cell w-32">Score</th>
                  <th className="px-4 py-3 hidden sm:table-cell w-28">
                    Sportsbook
                  </th>
                  <th className="px-4 py-3 text-right w-20">Odds</th>
                  <th className="px-4 py-3 text-right w-28">Wager</th>
                  <th className="px-4 py-3 text-center w-28">Result</th>
                  <th className="px-4 py-3 text-right w-20"></th>
                </tr>
              </thead>

              {groupedBets.map((group) => {
                const isExpanded = expandedDates.has(group.date);
                const dateProfitClass =
                  group.totalProfit > 0
                    ? "text-status-win"
                    : group.totalProfit < 0
                      ? "text-status-loss"
                      : "text-ink-text/40";

                return (
                  <tbody
                    key={group.date}
                    className="border-b border-ink-gray last:border-b-0"
                  >
                    <tr
                      className="bg-ink-paper hover:bg-ink-base/50 cursor-pointer transition-colors border-t border-ink-gray"
                      onClick={() => toggleDateGroup(group.date)}
                    >
                      <td colSpan={7} className="px-4 py-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown
                                size={16}
                                className="text-ink-text/40"
                              />
                            ) : (
                              <ChevronRight
                                size={16}
                                className="text-ink-text/40"
                              />
                            )}
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-ink-accent" />
                              <span className="text-sm font-bold text-ink-text">
                                {formatDate(group.date)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-medium">
                            <span className="text-ink-text/40 font-mono hidden sm:inline">
                              {group.wins}W - {group.losses}L
                            </span>
                            <span
                              className={`font-mono font-bold ${dateProfitClass}`}
                            >
                              {group.totalProfit > 0 ? "+" : ""}
                              {formatCurrency(group.totalProfit)}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {isExpanded &&
                      group.bets.map((bet) => {
                        const isEditing = editingId === bet.id;
                        const isDeleting = deleteConfirmId === bet.id;
                        const displayPick = formatBetPickDisplay(
                          bet.pick,
                          bet.matchup,
                        );

                        return (
                          <tr
                            key={bet.id}
                            className={`group transition-all border-t border-ink-gray/30 ${!isEditing ? "hover:bg-ink-base/50" : "bg-ink-base"}`}
                          >
                            {isEditing ? (
                              <>
                                <td className="px-4 py-3 pl-8">
                                  <div className="space-y-2">
                                    <input
                                      value={editForm.matchup}
                                      onChange={(e) =>
                                        setEditForm({
                                          ...editForm,
                                          matchup: e.target.value,
                                        })
                                      }
                                      className="bg-ink-paper border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-full"
                                    />
                                    <input
                                      value={editForm.pick}
                                      onChange={(e) =>
                                        setEditForm({
                                          ...editForm,
                                          pick: e.target.value,
                                        })
                                      }
                                      className="bg-ink-paper border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-full"
                                    />
                                  </div>
                                </td>
                                <td className="hidden xl:table-cell"></td>
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  <select
                                    value={editForm.sportsbook}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        sportsbook: e.target
                                          .value as Sportsbook,
                                      })
                                    }
                                    className="bg-ink-paper border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-full"
                                  >
                                    {SPORTSBOOKS.map((sb) => (
                                      <option key={sb} value={sb}>
                                        {sb}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <input
                                    type="number"
                                    value={editForm.odds}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        odds: Number(e.target.value),
                                      })
                                    }
                                    className="bg-ink-paper border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-20 text-right"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <input
                                    type="number"
                                    value={editForm.wager}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        wager: Number(e.target.value),
                                      })
                                    }
                                    className="bg-ink-paper border border-ink-gray rounded px-2 py-1 text-ink-text text-xs w-20 text-right"
                                  />
                                </td>
                                <td className="px-4 py-3 text-center text-xs text-ink-text/40">
                                  Saving...
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button
                                      onClick={handleSaveEdit}
                                      className="p-1.5 rounded bg-ink-accent/20 text-ink-accent"
                                    >
                                      <Save size={14} />
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="p-1.5 rounded bg-ink-gray/50 text-ink-text/60"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-2 align-top pl-8 border-l-4 border-l-transparent hover:border-l-ink-accent">
                                  <div className="flex flex-col items-start">
                                    <span className="text-ink-text font-bold text-sm">
                                      {bet.matchup}
                                    </span>
                                    <span className="text-ink-text/60 text-[11px] mt-0.5">
                                      {displayPick}
                                    </span>
                                    {bet.tags && bet.tags.length > 0 && (
                                      <div className="flex gap-1 mt-1">
                                        {bet.tags.map((tag) => (
                                          <span
                                            key={tag}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getTagColor(tag)}`}
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {/* Mobile/Tablet Fallback score if column hidden */}
                                    <div className="lg:hidden mt-1.5">
                                      {renderScore(bet)}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2 align-top hidden lg:table-cell vertical-middle">
                                  {renderScore(bet)}
                                </td>
                                <td className="px-4 py-2 align-top hidden sm:table-cell">
                                  <span
                                    className="text-[11px] font-bold"
                                    style={{
                                      color: getBookTextColor(bet.sportsbook),
                                    }}
                                  >
                                    {bet.sportsbook}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-[12px] font-mono font-bold text-ink-text align-top">
                                  {bet.odds > 0 ? `+${bet.odds}` : bet.odds}
                                </td>
                                <td className="px-4 py-2 text-right align-top">
                                  <div className="flex flex-col items-end">
                                    <span className="text-ink-text font-medium text-[12px] font-mono">
                                      {formatCurrency(bet.wager)}
                                    </span>
                                    <span className="text-status-win text-[10px] font-mono">
                                      To Win:{" "}
                                      {formatCurrency(bet.potentialProfit)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-center align-top">
                                  <div className="flex flex-nowrap justify-center gap-1">
                                    {bet.status === BetStatus.PENDING ? (
                                      <>
                                        <button
                                          onClick={() =>
                                            onUpdateStatus(
                                              bet.id,
                                              BetStatus.WON,
                                            )
                                          }
                                          className="p-1 rounded bg-ink-base border border-ink-gray text-ink-text/40 hover:text-status-win hover:border-status-win"
                                        >
                                          <TrendingUp size={14} />
                                        </button>
                                        <button
                                          onClick={() =>
                                            onUpdateStatus(
                                              bet.id,
                                              BetStatus.LOST,
                                            )
                                          }
                                          className="p-1 rounded bg-ink-base border border-ink-gray text-ink-text/40 hover:text-status-loss hover:border-status-loss"
                                        >
                                          <TrendingDown size={14} />
                                        </button>
                                        <button
                                          onClick={() =>
                                            onUpdateStatus(
                                              bet.id,
                                              BetStatus.PUSH,
                                            )
                                          }
                                          className="p-1 rounded bg-ink-base border border-ink-gray text-ink-text/40 hover:text-white"
                                        >
                                          <MinusCircle size={14} />
                                        </button>
                                      </>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                                            bet.status === BetStatus.WON
                                              ? "bg-status-win/10 text-status-win border-status-win/20"
                                              : bet.status === BetStatus.LOST
                                                ? "bg-status-loss/10 text-status-loss border-status-loss/20"
                                                : "bg-ink-gray/20 text-ink-text/60 border-ink-gray"
                                          }`}
                                        >
                                          {bet.status}
                                        </span>
                                        <button
                                          onClick={() =>
                                            onUpdateStatus(
                                              bet.id,
                                              BetStatus.PENDING,
                                            )
                                          }
                                          className="text-[9px] text-ink-text/20 hover:text-ink-text"
                                        >
                                          Undo
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right align-top">
                                  {isDeleting ? (
                                    <div className="flex justify-end gap-1.5 items-center">
                                      <button
                                        onClick={() => onDelete(bet.id)}
                                        className="p-1 rounded bg-status-loss/20 text-status-loss"
                                      >
                                        <Check size={12} />
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmId(null)}
                                        className="p-1 rounded bg-ink-gray/50 text-ink-text/60"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => handleStartEdit(bet)}
                                        className="text-ink-text/40 hover:text-ink-accent p-1.5"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                      <button
                                        onClick={() =>
                                          setDeleteConfirmId(bet.id)
                                        }
                                        className="text-ink-text/40 hover:text-status-loss p-1.5"
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

          {/* MOBILE VIEW */}
          <div className="md:hidden space-y-4">
            {groupedBets.map((group) => {
              const isExpanded = expandedDates.has(group.date);
              const dateProfitClass =
                group.totalProfit > 0
                  ? "text-status-win"
                  : group.totalProfit < 0
                    ? "text-status-loss"
                    : "text-ink-text/40";

              return (
                <div key={group.date} className="space-y-2">
                  <div
                    onClick={() => toggleDateGroup(group.date)}
                    className="flex items-center justify-between p-3 bg-ink-paper border border-ink-gray rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-ink-text/40" />
                      ) : (
                        <ChevronRight size={16} className="text-ink-text/40" />
                      )}
                      <span className="text-sm font-bold text-ink-text">
                        {formatDate(group.date)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-mono text-sm font-bold ${dateProfitClass}`}
                      >
                        {group.totalProfit > 0 ? "+" : ""}
                        {formatCurrency(group.totalProfit)}
                      </p>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 pl-2">
                      {group.bets.map((bet) => {
                        const theme =
                          SPORTSBOOK_THEME[bet.sportsbook] ||
                          SPORTSBOOK_THEME[Sportsbook.OTHER];
                        const isEditing = editingId === bet.id;
                        const isDeleting = deleteConfirmId === bet.id;
                        const isMenuOpen = mobileMenuId === bet.id;
                        const displayPick = formatBetPickDisplay(
                          bet.pick,
                          bet.matchup,
                        );

                        return (
                          <div
                            key={bet.id}
                            className="bg-ink-paper rounded-xl border border-ink-gray p-3 shadow-sm relative overflow-hidden"
                          >
                            <div
                              className="absolute left-0 top-0 bottom-0 w-1"
                              style={{ backgroundColor: theme.bg }}
                            ></div>
                            <div className="pl-3">
                              {isEditing ? (
                                /* Mobile Edit Mode */
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-ink-accent uppercase">
                                      Editing Bet
                                    </span>
                                    <div className="flex gap-1">
                                      <button
                                        onClick={handleSaveEdit}
                                        className="p-1.5 rounded bg-ink-accent/20 text-ink-accent"
                                      >
                                        <Save size={14} />
                                      </button>
                                      <button
                                        onClick={() => setEditingId(null)}
                                        className="p-1.5 rounded bg-ink-gray/50 text-ink-text/60"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                  <input
                                    value={editForm.matchup || ""}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        matchup: e.target.value,
                                      })
                                    }
                                    placeholder="Matchup"
                                    className="w-full bg-ink-base border border-ink-gray rounded-lg px-3 py-2 text-ink-text text-sm"
                                  />
                                  <input
                                    value={editForm.pick || ""}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        pick: e.target.value,
                                      })
                                    }
                                    placeholder="Pick"
                                    className="w-full bg-ink-base border border-ink-gray rounded-lg px-3 py-2 text-ink-text text-sm"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] text-ink-text/40 uppercase font-bold">
                                        Odds
                                      </label>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={editForm.odds || ""}
                                        onChange={(e) =>
                                          setEditForm({
                                            ...editForm,
                                            odds: Number(e.target.value),
                                          })
                                        }
                                        className="w-full bg-ink-base border border-ink-gray rounded-lg px-3 py-2 text-ink-text text-sm font-mono"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-ink-text/40 uppercase font-bold">
                                        Wager
                                      </label>
                                      <input
                                        type="number"
                                        value={editForm.wager || ""}
                                        onChange={(e) =>
                                          setEditForm({
                                            ...editForm,
                                            wager: Number(e.target.value),
                                          })
                                        }
                                        className="w-full bg-ink-base border border-ink-gray rounded-lg px-3 py-2 text-ink-text text-sm font-mono"
                                      />
                                    </div>
                                  </div>
                                  <select
                                    value={editForm.sportsbook || ""}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        sportsbook: e.target
                                          .value as Sportsbook,
                                      })
                                    }
                                    className="w-full bg-ink-base border border-ink-gray rounded-lg px-3 py-2 text-ink-text text-sm"
                                  >
                                    {SPORTSBOOKS.map((sb) => (
                                      <option key={sb} value={sb}>
                                        {sb}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                /* Mobile View Mode */
                                <>
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] font-bold text-ink-text/40 uppercase mb-1">
                                        {bet.sport} • {bet.sportsbook}
                                      </p>
                                      <h4 className="font-bold text-ink-text text-sm">
                                        {bet.matchup}
                                      </h4>
                                      <p className="text-[11px] text-ink-text/60 mt-0.5">
                                        {displayPick}
                                      </p>
                                      <div className="mt-2">
                                        {renderScore(bet)}
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-1 ml-2">
                                      <span className="font-mono font-bold text-ink-text bg-ink-base px-2 py-1 rounded text-xs">
                                        {bet.odds > 0
                                          ? `+${bet.odds}`
                                          : bet.odds}
                                      </span>
                                      <button
                                        onClick={() =>
                                          setMobileMenuId(
                                            isMenuOpen ? null : bet.id,
                                          )
                                        }
                                        className="p-1 rounded text-ink-text/40 hover:text-ink-text"
                                      >
                                        <MoreVertical size={16} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Mobile Menu */}
                                  {isMenuOpen && (
                                    <div className="flex gap-2 mb-3 pb-3 border-b border-ink-gray/30">
                                      {isDeleting ? (
                                        <>
                                          <span className="text-xs text-status-loss font-medium flex-1">
                                            Delete this bet?
                                          </span>
                                          <button
                                            onClick={() => {
                                              onDelete(bet.id);
                                              setMobileMenuId(null);
                                            }}
                                            className="px-2 py-1 rounded bg-status-loss/20 text-status-loss text-xs font-bold"
                                          >
                                            Yes
                                          </button>
                                          <button
                                            onClick={() =>
                                              setDeleteConfirmId(null)
                                            }
                                            className="px-2 py-1 rounded bg-ink-gray/50 text-ink-text/60 text-xs font-bold"
                                          >
                                            No
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => handleStartEdit(bet)}
                                            className="flex-1 py-1.5 rounded bg-ink-base border border-ink-gray text-ink-text text-xs font-medium flex items-center justify-center gap-1"
                                          >
                                            <Edit2 size={12} /> Edit
                                          </button>
                                          <button
                                            onClick={() =>
                                              setDeleteConfirmId(bet.id)
                                            }
                                            className="flex-1 py-1.5 rounded bg-ink-base border border-ink-gray text-status-loss text-xs font-medium flex items-center justify-center gap-1"
                                          >
                                            <Trash2 size={12} /> Delete
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-ink-gray/30">
                                    <div className="flex gap-2">
                                      {bet.status === BetStatus.PENDING ? (
                                        <>
                                          <button
                                            onClick={() =>
                                              onUpdateStatus(
                                                bet.id,
                                                BetStatus.WON,
                                              )
                                            }
                                            className="p-1 rounded bg-ink-base text-status-win border border-ink-gray/50"
                                          >
                                            <TrendingUp size={14} />
                                          </button>
                                          <button
                                            onClick={() =>
                                              onUpdateStatus(
                                                bet.id,
                                                BetStatus.LOST,
                                              )
                                            }
                                            className="p-1 rounded bg-ink-base text-status-loss border border-ink-gray/50"
                                          >
                                            <TrendingDown size={14} />
                                          </button>
                                          <button
                                            onClick={() =>
                                              onUpdateStatus(
                                                bet.id,
                                                BetStatus.PUSH,
                                              )
                                            }
                                            className="p-1 rounded bg-ink-base text-ink-text/60 border border-ink-gray/50"
                                          >
                                            <MinusCircle size={14} />
                                          </button>
                                        </>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`text-xs font-bold uppercase ${bet.status === BetStatus.WON ? "text-status-win" : bet.status === BetStatus.LOST ? "text-status-loss" : "text-ink-text/40"}`}
                                          >
                                            {bet.status}
                                          </span>
                                          <button
                                            onClick={() =>
                                              onUpdateStatus(
                                                bet.id,
                                                BetStatus.PENDING,
                                              )
                                            }
                                            className="text-[10px] text-ink-text/20 hover:text-ink-text"
                                          >
                                            Undo
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-xs text-ink-text/40 uppercase font-bold">
                                        Wager
                                      </p>
                                      <p className="font-mono font-bold text-ink-text">
                                        {formatCurrency(bet.wager)}
                                      </p>
                                    </div>
                                  </div>
                                </>
                              )}
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
