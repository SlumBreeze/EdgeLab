
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { Bet, BookDeposit, BookBalanceDisplay, BankrollState, BetStatus } from '../types';
import { calculateBookBalances, calculateBankrollStats } from '../utils/calculations';

interface UseBankrollResult {
  bets: Bet[];
  bookBalances: BookBalanceDisplay[];
  totalBankroll: number;
  bankrollState: BankrollState;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateBookDeposit: (sportsbook: string, newDeposit: number) => Promise<void>;
  addBet: (betData: Bet) => Promise<void>;
  updateBetStatus: (id: string, status: BetStatus) => Promise<void>;
  updateBet: (updatedBet: Bet) => Promise<void>;
  deleteBet: (id: string) => Promise<void>;
}

export const useBankroll = (): UseBankrollResult => {
  const [deposits, setDeposits] = useState<BookDeposit[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Book Deposits (DETERMINISTIC & DEDUPED)
      const { data: booksResponse, error: booksError } = await supabase
        .from('book_balances')
        .select('sportsbook, deposited, updated_at, id');

      let finalBooks: BookDeposit[] = [];
      
      if (booksError) {
        console.error('Error fetching book balances:', booksError);
        setError(`Bankroll: ${booksError.message}`);
        finalBooks = [];
      } else {
        const rawBooks = booksResponse || [];
        
        // Debug Logging
        const totalRows = rawBooks.length;
        const bookCounts = rawBooks.reduce((acc: Record<string, number>, b: any) => {
           acc[b.sportsbook] = (acc[b.sportsbook] || 0) + 1;
           return acc;
        }, {});
        const duplicateCount = Object.values(bookCounts).filter(c => c > 1).length;
        console.log(`[Bankroll] Loaded ${totalRows} balance rows. Duplicates found: ${duplicateCount}`, bookCounts);

        // Deduplication Logic
        const bookMap = new Map<string, any>();
        
        rawBooks.forEach((row: any) => {
            const existing = bookMap.get(row.sportsbook);
            if (!existing) {
                bookMap.set(row.sportsbook, row);
                return;
            }

            // Conflict Resolution: Latest updated_at > Highest ID > Current (Last encountered)
            let isNewer = false;
            
            if (row.updated_at && existing.updated_at) {
                isNewer = new Date(row.updated_at) > new Date(existing.updated_at);
            } else if (row.id && existing.id) {
                // Fallback to ID if updated_at is missing
                 isNewer = row.id > existing.id;
            } else {
                // Fallback to "last one wins" if no metadata
                isNewer = true;
            }

            if (isNewer) {
                bookMap.set(row.sportsbook, row);
            }
        });

        finalBooks = Array.from(bookMap.values()).map(b => ({
            sportsbook: b.sportsbook,
            deposited: b.deposited
        }));
      }

      // 2. Fetch Bets
      const { data: betsResponse, error: betsError } = await supabase
        .from('bets')
        .select('*')
        .order('createdAt', { ascending: false });

      let finalBets: Bet[] = [];
      if (betsError) {
        console.error('Error fetching bets:', betsError);
        setError(prev => prev ? `${prev} | Bets: ${betsError.message}` : `Bets: ${betsError.message}`);
        finalBets = [];
      } else {
        // 3. Normalize fields
        finalBets = (betsResponse || []).map((b: any) => {
          // Normalize odds safely: keep null/undefined/NaN as-is, parse numbers if valid
          let safeOdds = b.odds;
          if (b.odds !== null && b.odds !== undefined) {
             const parsed = parseFloat(b.odds);
             if (!isNaN(parsed)) {
                 safeOdds = parsed;
             }
          }

          return {
            ...b,
            // Fallback 0 for financial calculations
            wager: Number(b.wager) || 0,
            potentialProfit: Number(b.potentialProfit) || 0,
            odds: safeOdds,
            // Standardize status
            status: b.status ? b.status.toUpperCase() : 'PENDING'
            // REMOVED: createdAt normalization. Preserving original type (likely string ISO).
          };
        }) as Bet[];
      }

      setDeposits(finalBooks);
      setBets(finalBets);

    } catch (err: any) {
      console.error('Uncaught error fetching bankroll data:', err);
      setError(err.message || 'Failed to load bankroll data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived State (using existing shared calculations)
  const bookBalances = useMemo(() => {
    return calculateBookBalances(bets, deposits);
  }, [bets, deposits]);

  const bankrollState = useMemo(() => {
    return calculateBankrollStats(deposits, bets);
  }, [bets, deposits]);

  const totalBankroll = bankrollState.currentBalance;

  // Action: Update Deposit
  const updateBookDeposit = async (sportsbook: string, newDeposit: number) => {
    // 0. Environment Check
    const sbUrl = import.meta.env.VITE_SUPABASE_URL;
    console.log(`[Bankroll] Updating ${sportsbook} to ${newDeposit}. Supabase URL defined: ${!!sbUrl}`);

    try {
      // Optimistic update
      setDeposits(prev => {
        const idx = prev.findIndex(d => d.sportsbook === sportsbook);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], deposited: newDeposit };
          return next;
        }
        return [...prev, { sportsbook, deposited: newDeposit }];
      });

      // 1. Verifiable Upsert
      console.log('[Bankroll] Sending upsert...');
      const { data: upsertData, error: upsertError } = await supabase
        .from('book_balances')
        .upsert({ sportsbook, deposited: newDeposit }, { onConflict: 'sportsbook' })
        .select()
        .single();

      if (upsertError) {
        console.error('[Bankroll] Upsert Failed:', upsertError);
        throw upsertError; // DO NOT swallow error. Let UI handle it.
      }
      
      console.log('[Bankroll] Upsert Success. Returned:', upsertData);

      // 2. Immediate Verification (Proof of Life)
      const { data: verifyData, error: verifyError } = await supabase
        .from('book_balances')
        .select('sportsbook, deposited')
        .eq('sportsbook', sportsbook)
        .single();

      console.log('[Bankroll] Verification Read:', verifyData, verifyError);

      await fetchData(); 

    } catch (err: any) {
      console.error('[Bankroll] Critical Update Error:', err);
      setError(`Failed to save: ${err.message || JSON.stringify(err)}`);
      // Re-throw so modal stays open or shows alert
      throw err; 
    }
  };

  // Action: Add Bet
  const addBet = async (betData: Bet) => {
    try {
      // Optimistic Update
      setBets(prev => [betData, ...prev]);

      const { error: insertError } = await supabase.from('bets').insert([betData]);
      if (insertError) throw insertError;
      
      // No full refresh needed if optimistic update is correct, 
      // but good to sync eventually. For now, we trust the optimistic update.
    } catch (err: any) {
      console.error('Error adding bet:', err);
      setError(err.message || 'Failed to add bet');
      // Revert optimistic update
      setBets(prev => prev.filter(b => b.id !== betData.id));
    }
  };

  // Action: Update Bet Status
  const updateBetStatus = async (id: string, status: BetStatus) => {
    try {
      // Optimistic Update
      setBets(prev => prev.map(b => b.id === id ? { ...b, status } : b));

      const { error: updateError } = await supabase
        .from('bets')
        .update({ status })
        .eq('id', id);

      if (updateError) throw updateError;
    } catch (err: any) {
      console.error('Error updating bet status:', err);
      setError(err.message || 'Failed to update bet status');
      await fetchData(); // Revert
    }
  };

  // Action: Update Bet Details
  const updateBet = async (updatedBet: Bet) => {
    try {
      // Optimistic Update
      setBets(prev => prev.map(b => b.id === updatedBet.id ? updatedBet : b));

      const { error: updateError } = await supabase
        .from('bets')
        .update({
          matchup: updatedBet.matchup,
          pick: updatedBet.pick,
          odds: updatedBet.odds,
          wager: updatedBet.wager,
          potentialProfit: updatedBet.potentialProfit,
          sportsbook: updatedBet.sportsbook,
          tags: updatedBet.tags
        })
        .eq('id', updatedBet.id);

      if (updateError) throw updateError;
    } catch (err: any) {
      console.error('Error updating bet:', err);
      setError(err.message || 'Failed to update bet');
      await fetchData(); // Revert
    }
  };

  // Action: Delete Bet
  const deleteBet = async (id: string) => {
    try {
      // Optimistic Update
      const previousBets = [...bets];
      setBets(prev => prev.filter(b => b.id !== id));

      const { error: deleteError } = await supabase
        .from('bets')
        .delete()
        .eq('id', id);

      if (deleteError) {
        // Revert
        setBets(previousBets);
        throw deleteError;
      }
    } catch (err: any) {
      console.error('Error deleting bet:', err);
      setError(err.message || 'Failed to delete bet');
    }
  };

  return {
    bets,
    bookBalances,
    totalBankroll,
    bankrollState,
    loading,
    error,
    refresh: fetchData,
    updateBookDeposit,
    addBet,
    updateBetStatus,
    updateBet,
    deleteBet
  };
};
