import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Bet } from '../../types';
import { formatDate } from '../../utils/calculations';

interface Props {
  bets: Bet[];
}

export const CLVTrendChart: React.FC<Props> = ({ bets }) => {
  const clvData = bets
    .filter(b => b.status !== 'PENDING' && b.clv_percent !== undefined)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((b, index) => ({
      index: index + 1,
      clv: b.clv_percent,
      date: formatDate(b.date),
      matchup: b.matchup
    }));

  if (clvData.length < 2) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-ink-base/30 rounded-xl border border-dashed border-ink-gray p-8">
        <p className="text-ink-text/40 text-sm font-mono">Insufficient data for trend analysis.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <LineChart
        data={clvData}
        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
        <XAxis 
          dataKey="index" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
          label={{ value: 'Bets (Chronological)', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 8 }}
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
          tickFormatter={(val) => `${val}%`}
          domain={['auto', 'auto']}
          width={40}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#1e293b', 
            borderRadius: '8px', 
            border: '1px solid #334155',
            fontSize: '10px'
          }}
          labelStyle={{ display: 'none' }}
          formatter={(value: number, name: string, props: any) => [
            <div key="tooltip">
              <div className="text-white font-bold">{props.payload.matchup}</div>
              <div className={value >= 0 ? 'text-status-win' : 'text-status-loss'}>
                CLV: {value.toFixed(2)}%
              </div>
              <div className="text-ink-text/40 text-[8px]">{props.payload.date}</div>
            </div>,
            ''
          ]}
        />
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <Line 
          type="monotone" 
          dataKey="clv" 
          stroke="#0ea5e9" 
          strokeWidth={2}
          dot={{ fill: '#0ea5e9', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 0 }}
          animationDuration={1000}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
