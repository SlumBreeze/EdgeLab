import React, { useState, useEffect } from 'react';
import { X, Save, Shield, Target, Zap, Activity } from 'lucide-react';
import { useGameContext } from '../hooks/useGameContext';
import { personaService } from '../services/personaService';
import { UserPersona } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_PERSONA: UserPersona = {
  user_id: '',
  min_edge_percentage: 0.1,
  volume_mode: 'High Action',
  max_odds_american: -175,
  risk_tolerance: 'Balanced',
  active_sports: ['NBA', 'NFL', 'MLB', 'NHL', 'SOCCER']
};

export const PersonaEditor: React.FC<Props> = ({ isOpen, onClose }) => {
  const { persona, setPersona, userId } = useGameContext();
  const [localPersona, setLocalPersona] = useState<UserPersona>(persona || { ...DEFAULT_PERSONA, user_id: userId });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (persona) {
      setLocalPersona(persona);
    }
  }, [persona]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await personaService.savePersona({ ...localPersona, user_id: userId });
      if (saved) {
        setPersona(saved);
        onClose();
      }
    } catch (error) {
      console.error('Failed to save persona:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSport = (sport: string) => {
    const active = localPersona.active_sports.includes(sport)
      ? localPersona.active_sports.filter(s => s !== sport)
      : [...localPersona.active_sports, sport];
    setLocalPersona({ ...localPersona, active_sports: active });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-ink-panel border border-ink-gray w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-ink-gray bg-ink-paper">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-ink-accent" />
            <h2 className="text-sm font-mono font-bold tracking-widest uppercase">AI Persona Configuration</h2>
          </div>
          <button 
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 font-mono text-xs">
          <div className="bg-ink-base/50 p-4 border-l-2 border-ink-accent">
            <p className="text-ink-accent font-bold mb-1">STOIC HANDICAPPER v3.0</p>
            <p className="text-ink-text/70 leading-relaxed">
              Adjust the core behavioral parameters of the AI agent. These settings directly influence the Veto System and the final daily card generation.
            </p>
          </div>

          {/* Action vs Precision */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-ink-accent" />
              <h3 className="uppercase font-bold tracking-wider text-ink-text">Operational Mode</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['High Action', 'High Precision'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLocalPersona({ ...localPersona, volume_mode: mode })}
                  className={`p-3 border transition-all text-center ${
                    localPersona.volume_mode === mode 
                      ? 'bg-ink-accent text-ink-base border-ink-accent font-bold' 
                      : 'bg-ink-paper text-ink-text/40 border-ink-gray hover:border-ink-accent/50 hover:text-ink-text/60'
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-ink-text/50 italic">
              * High Action prioritizes identifying the best side in every game.
            </p>
          </section>

          {/* Mathematical Thresholds */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-ink-accent" />
              <h3 className="uppercase font-bold tracking-wider text-ink-text">Mathematical Thresholds</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="min-edge" className="text-ink-text/60">MIN EDGE %</label>
                  <span className="text-ink-accent font-bold">{localPersona.min_edge_percentage}%</span>
                </div>
                <input
                  id="min-edge"
                  type="range"
                  min="0.1"
                  max="5.0"
                  step="0.1"
                  value={localPersona.min_edge_percentage}
                  onChange={(e) => setLocalPersona({ ...localPersona, min_edge_percentage: parseFloat(e.target.value) })}
                  className="w-full accent-ink-accent bg-ink-gray/30 h-1 appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="max-odds" className="text-ink-text/60">MAX ODDS (AMERICAN)</label>
                  <span className="text-ink-accent font-bold">{localPersona.max_odds_american}</span>
                </div>
                <input
                  id="max-odds"
                  type="number"
                  value={localPersona.max_odds_american}
                  onChange={(e) => setLocalPersona({ ...localPersona, max_odds_american: parseInt(e.target.value) })}
                  className="bg-ink-paper border border-ink-gray p-2 text-ink-text focus:border-ink-accent outline-none text-right"
                />
              </div>
            </div>
          </section>

          {/* Risk Tolerance */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-ink-accent" />
              <h3 className="uppercase font-bold tracking-wider text-ink-text">Risk Tolerance (Kelly Scaling)</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['Conservative', 'Balanced', 'Aggressive'].map((level) => (
                <button
                  key={level}
                  onClick={() => setLocalPersona({ ...localPersona, risk_tolerance: level })}
                  className={`p-2 border transition-all text-[10px] text-center ${
                    localPersona.risk_tolerance === level 
                      ? 'bg-ink-accent text-ink-base border-ink-accent font-bold' 
                      : 'bg-ink-paper text-ink-text/40 border-ink-gray hover:border-ink-accent/50 hover:text-ink-text/60'
                  }`}
                >
                  {level.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

          {/* Active Markets */}
          <section className="space-y-4">
            <h3 className="uppercase font-bold tracking-wider text-ink-text">Market Surveillance</h3>
            <div className="flex flex-wrap gap-2">
              {['NBA', 'NFL', 'MLB', 'NHL', 'SOCCER'].map((sport) => (
                <button
                  key={sport}
                  onClick={() => toggleSport(sport)}
                  className={`px-3 py-1 border transition-all text-[10px] uppercase ${
                    localPersona.active_sports.includes(sport)
                      ? 'border-ink-accent text-ink-accent bg-ink-accent/5'
                      : 'border-ink-gray text-ink-text/50 hover:border-ink-text/50'
                  }`}
                >
                  {sport}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-gray bg-ink-paper">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-ink-accent hover:bg-ink-accent/90 disabled:opacity-50 text-ink-base font-bold py-3 flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-sm"
          >
            {isSaving ? (
              <span className="animate-pulse">Writing to memory...</span>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Persona
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
