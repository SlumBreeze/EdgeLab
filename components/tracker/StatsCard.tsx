import React from 'react';

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
    <div className={`p-5 rounded-xl border transition-all duration-200 ${highlight 
      ? 'bg-ink-paper shadow-md border-ink-accent/30' 
      : 'bg-ink-paper/50 backdrop-blur-sm border-ink-gray hover:bg-ink-paper/80'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-ink-text/60 text-xs font-bold uppercase tracking-wider">{label}</p>
          <h3 className="text-2xl font-bold text-ink-text mt-1 tracking-tight">{value}</h3>
          {subValue && (
            <p className={`text-sm mt-1 font-medium ${
              trend === 'up' ? 'text-status-win' : 
              trend === 'down' ? 'text-status-loss' : 'text-ink-text/40'
            }`}>
              {subValue}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-ink-accent/10 text-ink-accent' : 'bg-white text-ink-text/40 border border-ink-gray/20'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
