import React, { useState } from "react";
import Scout from "./Scout";
import Queue from "./Queue";
import Card from "./Card";
import { DraftBet } from "../types/draftBet";

type MainSection = "scout" | "analysis" | "playables";

export default function Main({
  onLogBet,
}: {
  onLogBet: (draft: DraftBet) => void;
}) {
  const [activeSection, setActiveSection] = useState<MainSection>("scout");

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-4 py-2 border-b border-ink-gray bg-ink-base/90 backdrop-blur">
        <div className="max-w-7xl mx-auto flex justify-center gap-2">
          <button
            onClick={() => setActiveSection("scout")}
            className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
              activeSection === "scout"
                ? "bg-ink-accent text-white border-ink-accent"
                : "bg-ink-paper text-ink-text/80 border-ink-gray"
            }`}
          >
            Scout
          </button>
          <button
            onClick={() => setActiveSection("analysis")}
            className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
              activeSection === "analysis"
                ? "bg-ink-accent text-white border-ink-accent"
                : "bg-ink-paper text-ink-text/80 border-ink-gray"
            }`}
          >
            Analysis
          </button>
          <button
            onClick={() => setActiveSection("playables")}
            className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
              activeSection === "playables"
                ? "bg-ink-accent text-white border-ink-accent"
                : "bg-ink-paper text-ink-text/80 border-ink-gray"
            }`}
          >
            Playables
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className={activeSection === "scout" ? "block h-full" : "hidden h-full"}>
          <Scout />
        </div>
        <div className={activeSection === "analysis" ? "block h-full" : "hidden h-full"}>
          <Queue />
        </div>
        <div className={activeSection === "playables" ? "block h-full" : "hidden h-full"}>
          <Card onLogBet={onLogBet} />
        </div>
      </div>
    </div>
  );
}
