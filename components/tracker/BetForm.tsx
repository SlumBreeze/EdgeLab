import React, { useState, useEffect, useRef } from 'react';
import { PlusCircle, Calculator, DollarSign, Camera, Loader2, Settings2, Calendar } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { Sportsbook, BetStatus, BookBalanceDisplay } from '../../types';
import { DraftBet } from '../../types/draftBet';
import { calculatePotentialProfit, formatCurrency, formatBetPickDisplay } from '../../utils/calculations';
import { SPORTSBOOKS, SPORTS } from '../../constants';

interface BetFormProps {
  onAddBet: (betData: any) => void;
  currentBalance: number; // Total Bankroll
  bookBalances: BookBalanceDisplay[];
  draftBet?: DraftBet | null;
}

export const BetForm: React.FC<BetFormProps> = ({ onAddBet, currentBalance, bookBalances, draftBet }) => {
  // Initialize with local date string instead of ISO/UTC
  const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeDateInput = (value?: string | null) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(getTodayString());
  const [matchup, setMatchup] = useState('');
  const [sport, setSport] = useState('NFL');
  const [sportsbook, setSportsbook] = useState<Sportsbook>(Sportsbook.DRAFTKINGS);
  const [pick, setPick] = useState('');
  
  // Use string | number to allow typing decimals/negatives without forced casting
  const [odds, setOdds] = useState<string | number>(-110);
  const [wager, setWager] = useState<string | number>('');
  
  const [calculatedPayout, setCalculatedPayout] = useState(0);
  
  const [wagerPct, setWagerPct] = useState(1);
  const [showStrategy, setShowStrategy] = useState(false);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill from DraftBet
  useEffect(() => {
    if (draftBet) {
      const normalizedDate = normalizeDateInput(draftBet.gameDate);
      if (normalizedDate) setDate(normalizedDate);
      const matchupText = draftBet.homeTeam && draftBet.awayTeam
        ? `${draftBet.awayTeam} @ ${draftBet.homeTeam}`
        : '';
      if (matchupText) setMatchup(matchupText);
      if (draftBet.sport) setSport(draftBet.sport);
      
      if (draftBet.sportsbook) {
        // Attempt to fuzzy match sportsbook string to Enum
        const found = Object.values(Sportsbook).find(s => 
          s.toLowerCase().includes(draftBet.sportsbook!.toString().toLowerCase()) ||
          draftBet.sportsbook!.toString().toLowerCase().includes(s.toLowerCase())
        );
        if (found) setSportsbook(found as Sportsbook);
      }
      
      if (draftBet.pickTeam) {
        const market = (draftBet.market || '').toLowerCase();
        const isTotal = market.startsWith('total');
        const hasLine = draftBet.line !== null && draftBet.line !== undefined && !Number.isNaN(Number(draftBet.line));
        const lineVal = hasLine ? Number(draftBet.line) : null;
        let lineStr = '';
        if (lineVal !== null) {
          if (isTotal) {
            lineStr = ` ${lineVal}`;
          } else {
            lineStr = ` ${lineVal > 0 ? '+' : ''}${lineVal}`;
          }
        }
        const rawPick = `${draftBet.pickTeam}${lineStr}`.trim();
        setPick(formatBetPickDisplay(rawPick, matchupText || undefined));
      }
      
      if (draftBet.odds) setOdds(draftBet.odds);
      
      if (draftBet.stake !== undefined && draftBet.stake !== null) {
          setWager(draftBet.stake);
      } else {
          // If no stake provided in draft, use default calculation or leave empty
          // const recommended = calculateRecommendedWager();
          // setWager(recommended);
      }
    }
  }, [draftBet]);
  
  // Robust API Key retrieval
  const getApiKey = () => {
    try {
      // Check process.env first (for AI Studio injection)
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
      }
    } catch (e) {
      // ignore access errors
    }
    // Fallback to Vite env
    const env: any = (import.meta as any).env || {};
    return env.VITE_GEMINI_API_KEY || env.API_KEY || '';
  };

  const apiKey = getApiKey();
  const hasApiKey = !!apiKey;

  useEffect(() => {
    const w = parseFloat(String(wager));
    const o = parseFloat(String(odds));
    
    if (!isNaN(w) && !isNaN(o) && w > 0 && o !== 0) {
      const profit = calculatePotentialProfit(w, o);
      setCalculatedPayout(profit);
    } else {
      setCalculatedPayout(0);
    }
  }, [wager, odds]);

  const calculateRecommendedWager = () => {
    const base = Math.max(currentBalance, 0);
    const amount = base * (wagerPct / 100);
    return Math.floor(amount * 100) / 100; 
  };

  const applyRecommendedWager = () => {
    const amount = calculateRecommendedWager();
    setWager(amount);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(String(wager));
    const o = parseFloat(String(odds));

    if (!w || !o || !matchup || !pick) return;

    onAddBet({
      date,
      matchup,
      sport,
      sportsbook,
      pick,
      odds: o,
      wager: w,
      potentialProfit: calculatedPayout,
      status: BetStatus.PENDING,
      tags: [], 
    });

    setMatchup('');
    setPick('');
    setWager('');
    setCalculatedPayout(0);
  };

  // --- Image Analysis ---
  const handleScanClick = () => {
      if (!hasApiKey) {
          alert("Scanner Not Available: API Key not found. Please check your settings.");
          return;
      }
      // Reset value to ensure onChange triggers even if same file is selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      }
  };

  const processFile = async (file: File) => {
    if (!file) return;
    
    if (!apiKey) {
        alert("API Key is missing. Please check your deployment settings.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    setIsAnalyzing(true);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Handle both data URL formats (with and without base64 prefix)
          const parts = result.split(',');
          resolve(parts.length > 1 ? parts[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const ai = new GoogleGenAI({ apiKey });
      
      const schema = {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: "Date of the event in YYYY-MM-DD format" },
          matchup: { type: Type.STRING, description: "The matchup, e.g. 'Lakers vs Celtics'" },
          sport: { type: Type.STRING, description: "The sport league, e.g. NFL, NBA" },
          sportsbook: { type: Type.STRING, description: "The sportsbook name" },
          pick: { type: Type.STRING, description: "The bet selection/pick" },
          odds: { type: Type.NUMBER, description: "American odds (e.g. -110)" },
          wager: { type: Type.NUMBER, description: "The wager amount" }
        },
        required: ["matchup", "pick", "odds"]
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: {
          parts: [
            { inlineData: { mimeType: file.type || 'image/png', data: base64Data } },
            { text: `Analyze this betting slip image. Extract the bet details into the specified JSON format. If a field is not visible, exclude it.` }
          ]
        },
        config: { 
          responseMimeType: "application/json", 
          responseSchema: schema 
        }
      });

      if (response.text) {
        const result = JSON.parse(response.text);
        
        if (result.matchup) setMatchup(result.matchup);
        if (result.pick) setPick(result.pick);
        if (result.odds) setOdds(result.odds);
        if (result.date) setDate(result.date);
        
        if (result.wager && result.wager > 0) {
            setWager(result.wager);
        } else {
            setWager(calculateRecommendedWager());
        }

        // Fuzzy match sport
        if (result.sport) {
           const upperSport = result.sport.toUpperCase();
           const foundSport = SPORTS.find(s => s.toUpperCase() === upperSport);
           if (foundSport) setSport(foundSport);
        }

        // Fuzzy match sportsbook
        if (result.sportsbook) {
            const foundBook = SPORTSBOOKS.find(sb => sb.toLowerCase().includes(result.sportsbook.toLowerCase()));
            if (foundBook) setSportsbook(foundBook);
        }
      }
    } catch (error: any) {
      console.error("AI Analysis failed", error);
      alert("Failed to analyze image. Please try again.");
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => { 
    e.preventDefault(); 
    if (hasApiKey && !isAnalyzing) setIsDragging(true); 
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!hasApiKey) {
      alert("Scanner Not Available: API Key not found.");
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFile(e.target.files[0]);
  };

  const selectedBookBalance = bookBalances.find(b => b.sportsbook === sportsbook)?.currentBalance || 0;
  const recommendedAmount = calculateRecommendedWager();
  const showBalanceWarning = recommendedAmount > selectedBookBalance && showStrategy;

  // Helpers for validation
  const wNum = parseFloat(String(wager));
  const oNum = parseFloat(String(odds));
  const isValid = !isNaN(wNum) && !isNaN(oNum) && wNum > 0 && matchup && pick;

  return (
    <div className="space-y-6">
      <div 
        className={`bg-ink-paper rounded-2xl border transition-all duration-300 shadow-xl overflow-hidden ${isDragging ? 'border-ink-accent ring-2 ring-ink-accent/20 bg-ink-accent/5' : 'border-ink-gray'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-gray flex justify-between items-center bg-ink-paper/50">
          <div className="flex items-center gap-2">
            <PlusCircle className="text-ink-accent" size={20} />
            <h2 className="text-lg font-bold text-ink-text">Log Wager</h2>
          </div>
          <div className="flex gap-2">
            <button
               type="button"
               onClick={() => setShowStrategy(!showStrategy)}
               className={`p-2 rounded-lg transition-all ${showStrategy ? 'bg-ink-accent text-white shadow-md' : 'bg-ink-base text-ink-text/40 hover:text-ink-accent border border-ink-gray'}`}
            >
              <Calculator size={18} />
            </button>
            <button 
              type="button"
              onClick={handleScanClick}
              className={`p-2 rounded-lg border transition-all ${!hasApiKey ? 'bg-ink-base border-ink-gray text-ink-text/20 cursor-not-allowed' : 'bg-ink-base border-ink-gray text-ink-text/40 hover:text-ink-accent hover:shadow-sm'}`}
              disabled={isAnalyzing || !hasApiKey}
              title={!hasApiKey ? "API Key Missing" : "Scan Betting Slip"}
            >
              {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
          </div>
        </div>

        {/* Strategy Panel */}
        {showStrategy && (
          <div className="bg-ink-accent/10 px-5 py-4 border-b border-ink-accent/20">
             <div className="flex items-start justify-between">
                <div>
                   <h4 className="text-sm font-bold text-ink-accent flex items-center gap-2">
                     <Settings2 size={14} /> Smart Wager Size
                   </h4>
                   <p className="text-xs text-ink-text/60 mt-1">Based on {wagerPct}% of Total Bankroll</p>
                </div>
                <div className="text-right">
                   <p className="text-xl font-bold font-mono text-ink-text">{formatCurrency(recommendedAmount)}</p>
                   <button onClick={applyRecommendedWager} className="text-xs font-bold text-ink-accent hover:text-ink-text mt-1">
                      Apply
                   </button>
                </div>
             </div>
             
             <div className="mt-4 flex items-center gap-3">
                <span className="text-xs font-bold text-ink-text/60">Risk:</span>
                <input 
                  type="range" 
                  min="0.5" 
                  max="10" 
                  step="0.5" 
                  value={wagerPct}
                  onChange={(e) => setWagerPct(Number(e.target.value))}
                  className="flex-grow h-1.5 bg-ink-gray rounded-lg appearance-none cursor-pointer accent-ink-accent"
                />
                <span className="text-xs font-mono font-bold w-10 text-right text-ink-text">{wagerPct}%</span>
             </div>

             {showBalanceWarning && (
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                   <p>Warning: Amount exceeds {sportsbook} balance ({formatCurrency(selectedBookBalance)}).</p>
                </div>
             )}
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
                  className="w-full bg-ink-base border border-ink-gray rounded-xl pl-9 pr-2 py-3 text-sm font-medium focus:border-ink-accent outline-none text-ink-text placeholder:text-ink-text/20 transition-all focus:ring-1 focus:ring-ink-accent"
                />
             </div>
             <div className="relative sm:col-span-2">
                <input 
                  type="text" 
                  placeholder="Matchup (e.g. Lakers vs Celtics)"
                  value={matchup}
                  onChange={(e) => setMatchup(e.target.value)}
                  className="w-full bg-ink-base border border-ink-gray rounded-xl px-4 py-3 text-sm font-medium focus:border-ink-accent outline-none text-ink-text placeholder:text-ink-text/20 transition-all focus:ring-1 focus:ring-ink-accent"
                />
             </div>
          </div>

          <div className="relative">
            <input 
              type="text" 
              placeholder="Pick (e.g. Lakers -5.5)"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="w-full bg-ink-base border border-ink-gray rounded-xl px-4 py-3 text-sm font-medium focus:border-ink-accent outline-none text-ink-text placeholder:text-ink-text/20 transition-all focus:ring-1 focus:ring-ink-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <select 
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className="w-full bg-ink-base border border-ink-gray rounded-xl px-3 py-3 text-sm font-medium focus:border-ink-accent outline-none text-ink-text cursor-pointer"
            >
              {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            
            <select 
              value={sportsbook}
              onChange={(e) => setSportsbook(e.target.value as Sportsbook)}
              className="w-full bg-ink-base border border-ink-gray rounded-xl px-3 py-3 text-sm font-medium focus:border-ink-accent outline-none text-ink-text cursor-pointer"
            >
              {SPORTSBOOKS.map(sb => <option key={sb} value={sb}>{sb}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-text/40 font-bold text-[10px] uppercase">ODDS</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="-?[0-9]*"
                placeholder="-110"
                value={odds}
                onChange={(e) => setOdds(e.target.value)}
                className="w-full bg-ink-base border border-ink-gray rounded-xl pl-12 pr-4 py-3 text-right text-sm font-mono font-bold focus:border-ink-accent outline-none text-ink-text placeholder:text-ink-text/20 transition-all focus:ring-1 focus:ring-ink-accent"
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
                onChange={(e) => setWager(e.target.value)}
                className="w-full bg-ink-base border border-ink-gray rounded-xl pl-10 pr-4 py-3 text-right text-sm font-mono font-bold focus:border-ink-accent outline-none text-ink-text placeholder:text-ink-text/20 transition-all focus:ring-1 focus:ring-ink-accent"
              />
            </div>
          </div>

          <div className="pt-2">
             <button 
                type="submit"
                disabled={!isValid}
                className="w-full bg-ink-accent hover:bg-sky-500 text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(56,189,248,0.2)] transition-all active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
             >
                <PlusCircle size={18} />
                <span>Place Bet {calculatedPayout > 0 && <span className="opacity-80 font-mono ml-1"> (Win {formatCurrency(calculatedPayout)})</span>}</span>
             </button>
          </div>
        </form>
      </div>

      {isAnalyzing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-base/80 backdrop-blur-md">
           <Loader2 className="animate-spin text-ink-accent mb-4" size={48} />
           <p className="text-white font-bold text-lg animate-pulse font-mono">Decoding Slip...</p>
        </div>
      )}
    </div>
  );
}
