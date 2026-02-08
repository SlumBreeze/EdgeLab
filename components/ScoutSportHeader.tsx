import React, { useEffect, useState } from "react";
import { Sport } from "../types";
import { geminiService } from "../services/geminiService";

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
  const [aiStatus, setAiStatus] = useState<"idle" | "scanning" | "analyzing">("idle");

  useEffect(() => {
    const timer = setInterval(() => {
      setAiStatus(geminiService.getAiStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-1 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h2 className="text-lg font-bold text-ink-text">{label}</h2>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-mono text-ink-text/60 ml-2">
          <span
            className={`w-2 h-2 rounded-full ${
              aiStatus === "idle"
                ? "bg-ink-gray"
                : aiStatus === "scanning"
                  ? "bg-amber-400"
                  : "bg-emerald-400"
            }`}
          />
          <span>AI {aiStatus}</span>
        </div>
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
