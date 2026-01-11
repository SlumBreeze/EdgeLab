import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  highlight?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, subValue, trend, icon, highlight }) => {
  return (
    <div className={`p-5 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
      highlight 
      ? 'bg-ink-paper border-ink-accent/50 shadow-[0_0_20px_rgba(56,189,248,0.1)]' 
      : 'bg-ink-paper border-ink-gray hover:border-ink-gray/80 hover:bg-ink-paper/80'
    }`}>
      {/* Background glow effect on hover */}
      <div className="absolute -right-10 -top-10 w-24 h-24 bg-ink-accent/5 rounded-full blur-2xl group-hover:bg-ink-accent/10 transition-colors"></div>

      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-ink-text/40 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
          <h3 className="text-2xl font-bold text-ink-text font-mono tracking-tight">{value}</h3>
          {subValue && (
            <div className="flex items-center gap-1 mt-1">
              {trend === 'up' && <ArrowUpRight size={12} className="text-status-win" />}
              {trend === 'down' && <ArrowDownRight size={12} className="text-status-loss" />}
              {trend === 'neutral' && <Minus size={12} className="text-ink-text/40" />}
              <p className={`text-xs font-medium ${
                trend === 'up' ? 'text-status-win' : 
                trend === 'down' ? 'text-status-loss' : 'text-ink-text/40'
              }`}>
                {subValue}
              </p>
            </div>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${highlight ? 'bg-ink-accent text-white shadow-lg shadow-ink-accent/20' : 'bg-ink-base text-ink-text/40 border border-ink-gray/50'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};