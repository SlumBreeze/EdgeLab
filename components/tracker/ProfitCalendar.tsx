import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Bet, BetStatus } from '../../types';
import { formatCurrency } from '../../utils/calculations';

interface ProfitCalendarProps {
  bets: Bet[];
}

export const ProfitCalendar: React.FC<ProfitCalendarProps> = ({ bets }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Aggregate data by date
  const dailyData = useMemo(() => {
    const data: Record<string, { pnl: number, wins: number, losses: number, count: number }> = {};
    
    bets.forEach(bet => {
      // Skip pending
      if (bet.status === BetStatus.PENDING) return;
      
      const dateStr = bet.date; // YYYY-MM-DD
      if (!data[dateStr]) {
        data[dateStr] = { pnl: 0, wins: 0, losses: 0, count: 0 };
      }
      
      if (bet.status === BetStatus.WON) {
        data[dateStr].pnl += bet.potentialProfit;
        data[dateStr].wins += 1;
      } else if (bet.status === BetStatus.LOST) {
        data[dateStr].pnl -= bet.wager;
        data[dateStr].losses += 1;
      }
      
      // Increment count for all settled bets (Won, Lost, or Push)
      data[dateStr].count += 1; 
    });

    return data;
  }, [bets]);

  const renderCells = () => {
    const cells = [];
    // Total cells needed = padding + days
    const totalSlots = firstDayOfMonth + daysInMonth;
    // Calculate total rows to keep grid consistent (optional, but good for UI)
    // usually 5 or 6 rows
    
    // Padding for previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(<div key={`empty-${i}`} className="min-h-[6rem] bg-ink-base/30 border-b border-r border-ink-gray/20"></div>);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = dailyData[dateStr];
      
      let bgClass = 'bg-ink-paper';
      let pnlClass = 'text-ink-text/40';

      if (dayData) {
        if (dayData.pnl > 0) {
          bgClass = 'bg-status-win/10';
          pnlClass = 'text-status-win font-bold';
        } else if (dayData.pnl < 0) {
          bgClass = 'bg-status-loss/10';
          pnlClass = 'text-status-loss font-bold';
        } else if (dayData.count > 0) {
          // Break even
           pnlClass = 'text-ink-text/60 font-medium';
        }
      }

      cells.push(
        <div key={day} className={`min-h-[6rem] p-2 border-b border-r border-ink-gray/30 flex flex-col justify-between transition-colors hover:bg-opacity-80 ${bgClass}`}>
          <div className="flex justify-between items-start">
            <span className={`text-sm font-medium ${dayData ? 'text-ink-text' : 'text-ink-text/40'}`}>{day}</span>
            {dayData && (
                <span className="text-[10px] text-ink-text/40 font-medium">{dayData.wins}-{dayData.losses}</span>
            )}
          </div>
          
          <div className="text-center mt-1">
            {dayData ? (
                <span className={`text-sm ${pnlClass}`}>
                    {dayData.pnl > 0 ? '+' : ''}{formatCurrency(dayData.pnl)}
                </span>
            ) : null}
          </div>
        </div>
      );
    }
    
    // Fill remaining cells for the last row
    const cellsSoFar = cells.length;
    const remaining = 7 - (cellsSoFar % 7);
    if (remaining < 7) {
        for(let i=0; i<remaining; i++) {
            cells.push(<div key={`empty-end-${i}`} className="min-h-[6rem] bg-ink-base/30 border-b border-r border-ink-gray/20"></div>);
        }
    }

    return cells;
  };
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="bg-ink-paper/50 backdrop-blur-sm rounded-xl border border-ink-gray overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-ink-gray bg-ink-base/50">
         <h3 className="font-bold text-lg text-ink-text flex items-center gap-2">
            <CalendarIcon size={18} className="text-ink-accent"/>
            {monthNames[month]} {year}
         </h3>
         <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-ink-gray/20 text-ink-text/60 hover:text-ink-text transition-colors">
                <ChevronLeft size={20} />
            </button>
             <button onClick={() => setCurrentDate(new Date())} className="text-xs font-bold text-ink-accent px-2">Today</button>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-ink-gray/20 text-ink-text/60 hover:text-ink-text transition-colors">
                <ChevronRight size={20} />
            </button>
         </div>
      </div>
      
      {/* Days Header */}
      <div className="grid grid-cols-7 border-b border-ink-gray bg-ink-base/30">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-bold text-ink-text/40 uppercase tracking-wider">
                {d}
            </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 bg-ink-paper border-l border-t border-ink-gray/30">
         {renderCells()}
      </div>
    </div>
  );
};
