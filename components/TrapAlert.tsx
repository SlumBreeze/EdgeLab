import React from 'react';
import { AlertTriangle, MessageSquare, Info } from 'lucide-react';

interface Props {
  alert?: string;
  sentiment?: string;
}

export const TrapAlert: React.FC<Props> = ({ alert, sentiment }) => {
  if (!alert && !sentiment) return null;

  return (
    <div className="bg-ink-panel border border-ink-gray overflow-hidden font-mono text-[10px] mb-3">
      {/* Alert Section */}
      {alert && (
        <div className="flex bg-status-loss/10 border-b border-ink-gray">
          <div className="bg-status-loss text-ink-base px-2 py-3 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="p-2 flex-1">
            <div className="text-status-loss font-bold uppercase tracking-tighter mb-0.5 flex items-center gap-1">
              <span className="animate-pulse">●</span> TRAP ALERT DETECTED
            </div>
            <p className="text-ink-text leading-tight uppercase">
              {alert}
            </p>
          </div>
        </div>
      )}

      {/* Sentiment Section */}
      {sentiment && (
        <div className="flex bg-ink-base/40">
          <div className="bg-ink-accent/20 text-ink-accent px-2 py-3 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="p-2 flex-1">
            <div className="text-ink-accent font-bold uppercase tracking-tighter mb-0.5">
              MARKET SURVEILLANCE: EXPERT CONSENSUS
            </div>
            <p className="text-ink-muted leading-tight italic">
              "{sentiment}"
            </p>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="bg-ink-paper p-1 flex items-center justify-end gap-1 border-t border-ink-gray">
        <Info className="w-2.5 h-2.5 text-ink-muted" />
        <span className="text-[8px] text-ink-muted uppercase tracking-widest">Qualitative Audit Phase Complete</span>
      </div>
    </div>
  );
};
