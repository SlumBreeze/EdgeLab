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
      <div className="h-full flex flex-col items-center justify-center bg-ink-base/30 rounded-xl border border-dashed border-ink-gray">
        <p className="text-ink-text/40 text-sm font-mono">Log more bets to generate trend data.</p>
      </div>
    );
  }

  // Determine min/max for domain to make chart look dynamic
  const balances = data.map(d => d.balance);
  let min = Math.min(...balances);
  let max = Math.max(...balances);
  
  if (min === max) {
    min -= 100;
    max += 100;
  }

  const range = max - min;
  const buffer = range * 0.1;
  const showDecimals = range < 10;

  const formatAxisTick = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: showDecimals ? 2 : 0,
      notation: val > 100000 ? 'compact' : 'standard'
    }).format(val);
  };

  const isPositive = (data[data.length - 1].balance - data[0].balance) >= 0;
  const strokeColor = isPositive ? '#34d399' : '#f87171'; // Emerald or Red

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={strokeColor} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
        <XAxis 
          dataKey="formattedDate" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          dy={10}
          minTickGap={30}
        />
        <YAxis 
          hide={false}
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          tickFormatter={formatAxisTick}
          domain={[min - buffer, max + buffer]}
          width={60}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#1e293b', 
            borderRadius: '12px', 
            border: '1px solid #334155',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' 
          }}
          itemStyle={{ color: '#f8fafc', fontWeight: 'bold', fontFamily: 'JetBrains Mono' }}
          labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px', fontFamily: 'Inter' }}
          formatter={(value: number) => [formatCurrency(value), 'Balance']}
          cursor={{ stroke: '#475569', strokeWidth: 1 }}
        />
        <Area 
          type="monotone" 
          dataKey="balance" 
          stroke={strokeColor}
          strokeWidth={3}
          fillOpacity={1} 
          fill="url(#colorBalance)" 
          animationDuration={1500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};