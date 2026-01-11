import React, { useState, useEffect, useRef } from "react";
import {
  PlusCircle,
  Calculator,
  DollarSign,
  Camera,
  Loader2,
  Settings2,
  Tag,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import { Sportsbook, BetStatus, BookBalanceDisplay } from "../../types";
import { DraftBet } from "../../types/draftBet";
import {
  calculatePotentialProfit,
  formatCurrency,
} from "../../utils/calculations";
import { SPORTSBOOKS, SPORTS } from "../../constants";

interface BetFormProps {
  onAddBet: (betData: any) => void;
  currentBalance: number; // Total Bankroll
  bookBalances: BookBalanceDisplay[];
  draftBet?: DraftBet | null;
}

const COMMON_TAGS = ["Live", "Parlay", "Boost", "Prop"];

export const BetForm: React.FC<BetFormProps> = ({
  onAddBet,
  currentBalance,
  bookBalances,
  draftBet,
}) => {
  // Initialize with local date string instead of ISO/UTC
  const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(getTodayString());
  const [matchup, setMatchup] = useState("");
  const [sport, setSport] = useState("NFL");
  const [sportsbook, setSportsbook] = useState<Sportsbook>(
    Sportsbook.DRAFTKINGS
  );
  const [pick, setPick] = useState("");
  const [odds, setOdds] = useState<number | "">(-110);
  const [wager, setWager] = useState<number | "">("");
  const [calculatedPayout, setCalculatedPayout] = useState(0);
  const [tags, setTags] = useState<string[]>([]);

  // Wager Strategy State
  const [wagerPct, setWagerPct] = useState(1);
  const [showStrategy, setShowStrategy] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effect to pre-fill from draftBet
  useEffect(() => {
    if (draftBet) {
      if (draftBet.gameDate) setDate(draftBet.gameDate.split('T')[0]);
      if (draftBet.homeTeam && draftBet.awayTeam) setMatchup(`${draftBet.awayTeam} @ ${draftBet.homeTeam}`);
      if (draftBet.sport) setSport(draftBet.sport);
      if (draftBet.sportsbook) {
        // Attempt to match sportsbook string to Enum
        const found = Object.values(Sportsbook).find(s => 
          s.toLowerCase().includes(draftBet.sportsbook!.toString().toLowerCase()) ||
          draftBet.sportsbook!.toString().toLowerCase().includes(s.toLowerCase())
        );
        if (found) setSportsbook(found as Sportsbook);
      }
      if (draftBet.pickTeam) setPick(`${draftBet.pickTeam} ${draftBet.line || ''}`.trim());
      if (draftBet.odds) setOdds(draftBet.odds);
      if (draftBet.rationale) setTags(['EdgeLab Analysis']);
      
      // Auto-calculate recommended wager if not set
      const recommended = calculateRecommendedWager();
      setWager(recommended);
    }
  }, [draftBet]);

  useEffect(() => {
    if (wager && odds) {
      const profit = calculatePotentialProfit(Number(wager), Number(odds));
      setCalculatedPayout(profit);
    } else {
      setCalculatedPayout(0);
    }
  }, [wager, odds]);

  const calculateRecommendedWager = () => {
    // Basic calculation: Percentage of TOTAL bankroll
    const base = Math.max(currentBalance, 0);
    const amount = base * (wagerPct / 100);
    return Math.floor(amount * 100) / 100; // Round down to 2 decimals
  };

  const applyRecommendedWager = () => {
    const amount = calculateRecommendedWager();
    setWager(amount);
  };

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wager || !odds || !matchup || !pick) return;

    onAddBet({
      date,
      matchup,
      sport,
      sportsbook,
      pick,
      odds: Number(odds),
      wager: Number(wager),
      potentialProfit: calculatedPayout,
      status: BetStatus.PENDING,
      tags,
    });

    // Reset fields
    setMatchup("");
    setPick("");
    setWager("");
    setCalculatedPayout(0);
    setTags([]);
  };

  // --- Image Analysis (Gemini) ---
  const handleScanClick = () => fileInputRef.current?.click();

  const processFile = async (file: File) => {
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const schema = {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          matchup: { type: Type.STRING },
          sport: { type: Type.STRING, enum: SPORTS },
          sportsbook: { type: Type.STRING, enum: SPORTSBOOKS },
          pick: { type: Type.STRING },
          odds: { type: Type.NUMBER },
          wager: { type: Type.NUMBER },
        },
        required: ["matchup", "pick", "odds", "sportsbook", "sport"],
      };

      const genAI = new GoogleGenAI({
        apiKey: import.meta.env.VITE_GEMINI_API_KEY,
      });
      const result = await genAI.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data,
            },
          },
          "Analyze betting slip. Extract details.",
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const responseText = result.candidates[0].content.parts[0].text;
      if (responseText) {
        const resultData = JSON.parse(responseText);
        if (resultData.matchup) setMatchup(resultData.matchup);
        if (resultData.pick) setPick(resultData.pick);
        if (resultData.odds) setOdds(resultData.odds);
        if (resultData.date) setDate(resultData.date);
        if (resultData.wager && resultData.wager > 0)
          setWager(resultData.wager);
        else setWager(calculateRecommendedWager());
        if (resultData.sport && SPORTS.includes(resultData.sport))
          setSport(resultData.sport);
        if (
          resultData.sportsbook &&
          SPORTSBOOKS.includes(resultData.sportsbook)
        )
          setSportsbook(resultData.sportsbook);
      }
    } catch (error) {
      console.error("AI Analysis failed", error);
      alert(
        `Failed to analyze image: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0)
      processFile(e.target.files[0]);
  };

  // Determine current book balance and if warning is needed
  const selectedBookBalance =
    bookBalances.find((b) => b.sportsbook === sportsbook)?.currentBalance || 0;
  const recommendedAmount = calculateRecommendedWager();
  const showBalanceWarning =
    recommendedAmount > selectedBookBalance && showStrategy;

  return (
    <div className="space-y-6 animate-in slide-in-from-left duration-500">
      <div
        className={`bg-ink-paper rounded-xl border transition-all duration-300 shadow-sm overflow-hidden ${
          isDragging
            ? "border-ink-accent ring-2 ring-ink-accent/20 bg-ink-accent/5"
            : "border-ink-gray"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-gray flex justify-between items-center bg-ink-base/50">
          <div className="flex items-center gap-2">
            <PlusCircle className="text-ink-accent" size={20} />
            <h2 className="text-lg font-bold text-ink-text">Log Wager</h2>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowStrategy(!showStrategy)}
              className={`p-2 rounded-lg transition-all ${
                showStrategy
                  ? "bg-ink-accent text-white shadow-md"
                  : "bg-white text-ink-text/40 hover:text-ink-accent border border-ink-gray"
              }`}
              title="Wager Strategy Calculator"
            >
              <Calculator size={18} />
            </button>
            <button
              type="button"
              onClick={handleScanClick}
              className="p-2 bg-white text-ink-text/40 hover:text-ink-accent rounded-lg border border-ink-gray transition-all hover:shadow-sm"
              title="Scan Slip with AI"
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Camera size={18} />
              )}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*"
            />
          </div>
        </div>

        {/* Wager Strategy Panel */}
        {showStrategy && (
          <div className="bg-ink-accent/5 px-5 py-4 border-b border-ink-accent/20 animate-in slide-in-from-top duration-300">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-ink-accent flex items-center gap-2">
                  <Settings2 size={14} /> Smart Wager Size
                </h4>
                <p className="text-xs text-ink-text/60 mt-1">
                  Based on {wagerPct}% of Total Bankroll (
                  {formatCurrency(currentBalance)})
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-ink-text">
                  {formatCurrency(recommendedAmount)}
                </p>
                <button
                  onClick={applyRecommendedWager}
                  className="text-xs font-bold text-ink-accent hover:underline mt-1"
                >
                  Apply Amount
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs font-bold text-ink-text/60">Risk:</span>
              <input
                type="range"
                min="0.5"
                max="15"
                step="0.5"
                value={wagerPct}
                onChange={(e) => setWagerPct(Number(e.target.value))}
                className="flex-grow h-1.5 bg-ink-gray rounded-lg appearance-none cursor-pointer accent-ink-accent"
              />
              <span className="text-xs font-mono font-bold w-8 text-right">
                {wagerPct}%
              </span>
            </div>

            {/* Balance Warning */}
            {showBalanceWarning && (
              <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>
                  Warning: Recommended wager (
                  {formatCurrency(recommendedAmount)}) exceeds your balance on{" "}
                  <b>{sportsbook}</b> ({formatCurrency(selectedBookBalance)}).
                </p>
              </div>
            )}
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Row 1: Date & Matchup */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="relative sm:col-span-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-text/40">
                <Calendar size={14} />
              </span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-ink-base border border-ink-gray rounded-xl pl-9 pr-2 py-3 text-sm font-medium focus:border-ink-accent outline-none appearance-none cursor-pointer"
              />
            </div>
            <div className="relative sm:col-span-2">
              <input
                type="text"
                placeholder="Matchup (e.g. Lakers vs Celtics)"
                value={matchup}
                onChange={(e) => setMatchup(e.target.value)}
                className="w-full bg-ink-base border border-ink-gray rounded-xl px-4 py-3 text-sm font-medium focus:border-ink-accent outline-none transition-all placeholder:text-ink-text/30"
              />
            </div>
          </div>

          {/* Row 2: Pick */}
          <div className="relative">
            <input
              type="text"
              placeholder="Pick (e.g. Lakers -5.5)"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="w-full bg-ink-base border border-ink-gray rounded-xl px-4 py-3 text-sm font-medium focus:border-ink-accent outline-none transition-all placeholder:text-ink-text/30"
            />
          </div>

          {/* Row 3: Selects */}
          <div className="grid grid-cols-2 gap-4">
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className="w-full bg-ink-base border border-ink-gray rounded-xl px-3 py-3 text-sm font-medium focus:border-ink-accent outline-none appearance-none cursor-pointer"
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={sportsbook}
              onChange={(e) => setSportsbook(e.target.value as Sportsbook)}
              className="w-full bg-ink-base border border-ink-gray rounded-xl px-3 py-3 text-sm font-medium focus:border-ink-accent outline-none appearance-none cursor-pointer"
            >
              {SPORTSBOOKS.map((sb) => (
                <option key={sb} value={sb}>
                  {sb}
                </option>
              ))}
            </select>
          </div>

          {/* Row 4: Numbers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-text/40 font-bold text-xs">
                ODDS
              </span>
              <input
                type="number"
                placeholder="-110"
                value={odds}
                onChange={(e) => setOdds(Number(e.target.value))}
                className="w-full bg-ink-base border border-ink-gray rounded-xl pl-12 pr-4 py-3 text-right text-sm font-mono font-bold focus:border-ink-accent outline-none"
              />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-text/40">
                <DollarSign size={14} />
              </span>
              <input
                type="number"
                placeholder="Wager"
                value={wager}
                onChange={(e) => setWager(Number(e.target.value))}
                className="w-full bg-ink-base border border-ink-gray rounded-xl pl-10 pr-4 py-3 text-right text-sm font-mono font-bold focus:border-ink-accent outline-none"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 pt-1">
            {COMMON_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  tags.includes(tag)
                    ? "bg-ink-accent text-white border-ink-accent"
                    : "bg-white text-ink-text/60 border-ink-gray hover:border-ink-accent/50"
                }`}
              >
                {tag}
              </button>
            ))}
            <div className="relative flex items-center">
              <Tag size={14} className="absolute left-2 text-ink-text/30" />
              <input
                type="text"
                placeholder="Add custom tag"
                className="pl-7 pr-2 py-1 bg-ink-base border border-ink-gray rounded-full text-xs outline-none focus:border-ink-accent w-28"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if (val && !tags.includes(val)) toggleTag(val);
                    e.currentTarget.value = "";
                  }
                }}
              />
            </div>
          </div>

          {/* Footer / Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!wager || !odds || !matchup || !pick}
              className="w-full bg-ink-accent hover:bg-slate-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-ink-accent/20 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <PlusCircle size={18} />
              <span>
                Place Bet{" "}
                {calculatedPayout > 0 && (
                  <span className="opacity-80 font-mono ml-1">
                    {" "}
                    (To Win {formatCurrency(calculatedPayout)})
                  </span>
                )}
              </span>
            </button>
          </div>
        </form>
      </div>

      {isAnalyzing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <Loader2 className="animate-spin text-white mb-4" size={48} />
          <p className="text-white font-bold text-lg animate-pulse">
            Analyzing Slip...
          </p>
        </div>
      )}
    </div>
  );
};

