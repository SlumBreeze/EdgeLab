import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BankrollHistoryPoint } from '../../types';
import { formatCurrency } from '../../utils/calculations';

interface BankrollTrendChartProps {
  data: BankrollHistoryPoint[];
}

export const BankrollTrendChart: React.FC<BankrollTrendChartProps> = ({ data }) => {
  if (!data || data.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center bg-ink-paper/50 rounded-xl border border-ink-gray">
        <p className="text-ink-text/40 text-sm">Log more bets to see your bankroll trend.</p>
      </div>
    );
  }

  // Determine min/max for domain to make chart look dynamic
  const balances = data.map(d => d.balance);
  let min = Math.min(...balances);
  let max = Math.max(...balances);
  
  // Handle edge case where min equals max (flat line)
  if (min === max) {
    min -= 100;
    max += 100;
  }

  const range = max - min;
  const buffer = range * 0.1;
  const showDecimals = range < 10; // Only show cents if the range is very tight

  const formatAxisTick = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: showDecimals ? 2 : 0,
      notation: val > 100000 ? 'compact' : 'standard'
    }).format(val);
  };

  return (
    <div className="bg-ink-paper/50 backdrop-blur-sm border border-ink-gray rounded-xl p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-ink-text">Bankroll Trend</h3>
        <p className="text-xs text-ink-text/60">Cumulative performance over time</p>
      </div>
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6D8196" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#6D8196" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CBCBCB" opacity={0.5} />
            <XAxis 
              dataKey="formattedDate" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#4A4A4A', fontSize: 10, opacity: 0.6 }}
              dy={10}
            />
            <YAxis 
              hide={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#4A4A4A', fontSize: 10, opacity: 0.6 }}
              tickFormatter={formatAxisTick}
              domain={[min - buffer, max + buffer]}
              width={60}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#ffffff', 
                borderRadius: '8px', 
                border: '1px solid #CBCBCB',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
              }}
              itemStyle={{ color: '#6D8196', fontWeight: 'bold' }}
              labelStyle={{ color: '#4A4A4A', fontSize: '12px', marginBottom: '4px' }}
              formatter={(value: number) => [formatCurrency(value), 'Balance']}
            />
            <Area 
              type="monotone" 
              dataKey="balance" 
              stroke="#6D8196" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorBalance)" 
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
