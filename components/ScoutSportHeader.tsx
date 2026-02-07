import React from "react";
import { Sport } from "../types";

interface ScoutSportHeaderProps {
  sport: Sport;
  icon: string;
  label: string;
  cadenceLabel: string;
  canProcessSport: boolean;
  isProcessingSport: boolean;
  onProcessSport: (sport: Sport) => void;
}

const ScoutSportHeader: React.FC<ScoutSportHeaderProps> = ({
  sport,
  icon,
  label,
  cadenceLabel,
  canProcessSport,
  isProcessingSport,
  onProcessSport,
}) => {
  return (
    <div className="flex flex-col gap-1 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="text-lg font-bold text-ink-text">{label}</h2>
        {(canProcessSport || isProcessingSport) && (
          <button
            onClick={() => onProcessSport(sport)}
            disabled={!canProcessSport || isProcessingSport}
            className={`ml-1 px-3 py-1.5 rounded-lg font-bold text-[10px] shadow-sm transition-all border ${
              canProcessSport && !isProcessingSport
                ? "bg-ink-accent text-white border-ink-accent hover:bg-sky-500"
                : "bg-ink-base text-ink-text/80 border-ink-gray"
            }`}
          >
            {isProcessingSport ? (
              <span className="animate-pulse">Processing...</span>
            ) : (
              `Process ${label}`
            )}
          </button>
        )}
      </div>
      <div className="text-[11px] text-ink-text/80">{cadenceLabel}</div>
    </div>
  );
};

export default ScoutSportHeader;
