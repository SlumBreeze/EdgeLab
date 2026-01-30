import React, { useCallback, useMemo } from "react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../components/AuthContext";
import {
  Bet,
  BookDeposit,
  BookBalanceDisplay,
  BankrollState,
  BetStatus,
} from "../types";
import {
  calculateBookBalances,
  calculateBankrollStats,
  calculateKellyWager,
} from "../utils/calculations";
import { SPORTSBOOKS } from "../constants";

interface UseBankrollResult {
  bets: Bet[];
  bookBalances: BookBalanceDisplay[];
  totalBankroll: number;
  bankrollState: BankrollState;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateBookBalance: (
    sportsbook: string,
    updates: { deposited?: number; withdrawn?: number },
  ) => Promise<void>;
  addBet: (betData: Bet) => Promise<void>;
  updateBetStatus: (id: string, status: BetStatus) => Promise<void>;
  updateBet: (updatedBet: Bet) => Promise<void>;
  deleteBet: (id: string) => Promise<void>;
  getKellyWager: (odds: number, winProbability: number, fractional?: number) => number;
}

export const useBankroll = (): UseBankrollResult => {
  const { user } = useAuth();
  const [deposits, setDeposits] = React.useState<BookDeposit[]>([]);
  const [bets, setBets] = React.useState<Bet[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const normalizeSportsbook = (value?: string) => {
    if (!value) return value || "";
    const raw = value.trim();
    if (!raw) return raw;
    const lower = raw.toLowerCase();
    const exact = SPORTSBOOKS.find((sb) => sb.toLowerCase() === lower);
    if (exact) return exact;
    const fuzzy = SPORTSBOOKS.find(
      (sb) =>
        sb.toLowerCase().includes(lower) || lower.includes(sb.toLowerCase()),
    );
    return fuzzy || raw;
  };

  const fetchData = useCallback(async () => {
    if (!user) return; // Wait for user

    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Book Deposits (DETERMINISTIC & DEDUPED)
      const { data: booksResponse, error: booksError } = await supabase
        .from("book_balances")
        .select("sportsbook, deposited, withdrawn, updated_at, id")
        .eq("user_id", user.id); // Filter by user

      let finalBooks: BookDeposit[] = [];

      if (booksError) {
        console.error("Error fetching book balances:", booksError);
        setError(`Bankroll: ${booksError.message}`);
        finalBooks = [];
      } else {
        const rawBooks = booksResponse || [];

        // Debug Logging
        const totalRows = rawBooks.length;
        const bookCounts = rawBooks.reduce(
          (acc: Record<string, number>, b: any) => {
            acc[b.sportsbook] = (acc[b.sportsbook] || 0) + 1;
            return acc;
          },
          {},
        );
        const duplicateCount = Object.values(bookCounts).filter(
          (c) => c > 1,
        ).length;
        console.log(
          `[Bankroll] Loaded ${totalRows} balance rows. Duplicates found: ${duplicateCount}`,
          bookCounts,
        );

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

        finalBooks = Array.from(bookMap.values()).map((b) => ({
          sportsbook: normalizeSportsbook(b.sportsbook),
          deposited: Number(b.deposited) || 0,
          withdrawn: Number(b.withdrawn) || 0,
        }));
      }

      // 2. Fetch Bets
      const { data: betsResponse, error: betsError } = await supabase
        .from("bets")
        .select("*")
        .eq("user_id", user.id) // Filter by user
        .order("createdAt", { ascending: false });

      let finalBets: Bet[] = [];
      if (betsError) {
        console.error("Error fetching bets:", betsError);
        setError((prev) =>
          prev
            ? `${prev} | Bets: ${betsError.message}`
            : `Bets: ${betsError.message}`,
        );
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
            sportsbook: normalizeSportsbook(b.sportsbook),
            // Fallback 0 for financial calculations
            wager: Number(b.wager) || 0,
            potentialProfit: Number(b.potentialProfit) || 0,
            odds: safeOdds,
            // Standardize status
            status: b.status ? b.status.toUpperCase() : "PENDING",
            // REMOVED: createdAt normalization. Preserving original type (likely string ISO).
          };
        }) as Bet[];
      }

      setDeposits(finalBooks);
      setBets(finalBets);
    } catch (err: any) {
      console.error("Uncaught error fetching bankroll data:", err);
      setError(err.message || "Failed to load bankroll data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial Load
  React.useEffect(() => {
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

  // New Kelly Helper
  const getKellyWager = (odds: number, winProbability: number, fractional: number = 0.25) => {
    return calculateKellyWager(totalBankroll, odds, winProbability, fractional);
  };

  // Action: Update Book Balance (Deposit or Withdraw)
  const updateBookBalance = async (
    sportsbook: string,
    updates: { deposited?: number; withdrawn?: number },
  ) => {
    // 0. Environment Check
    const sbUrl = import.meta.env.VITE_SUPABASE_URL;

    if (!user) {
      setError("You must be logged in to save balances.");
      return;
    }

    try {
      const existing = deposits.find((d) => d.sportsbook === sportsbook);
      // Optimistic update
      setDeposits((prev) => {
        const idx = prev.findIndex((d) => d.sportsbook === sportsbook);
        if (idx >= 0) {
          const next = [...prev];
          const existing = next[idx];
          next[idx] = {
            ...existing,
            deposited:
              updates.deposited !== undefined
                ? updates.deposited
                : existing.deposited,
            withdrawn:
              updates.withdrawn !== undefined
                ? updates.withdrawn
                : existing.withdrawn,
          };
          return next;
        }
        return [
          ...prev,
          {
            sportsbook,
            deposited: updates.deposited || 0,
            withdrawn: updates.withdrawn || 0,
          },
        ];
      });

      // 1. Verifiable Upsert
      const payload: any = { sportsbook, user_id: user.id };
      payload.deposited =
        updates.deposited !== undefined
          ? updates.deposited
          : existing?.deposited ?? 0;
      payload.withdrawn =
        updates.withdrawn !== undefined
          ? updates.withdrawn
          : existing?.withdrawn ?? 0;

      const { data: upsertData, error: upsertError } = await supabase
        .from("book_balances")
        .upsert(payload, { onConflict: "sportsbook,user_id" })
        .select()
        .single();

      if (upsertError) {
        console.error("[Bankroll] Upsert Failed:", upsertError);
        throw upsertError;
      }

      console.log("[Bankroll] Upsert Success. Returned:", upsertData);

      await fetchData();
    } catch (err: any) {
      console.error("[Bankroll] Critical Update Error:", err);
      setError(`Failed to save: ${err.message || JSON.stringify(err)}`);
      throw err;
    }
  };

  // Action: Add Bet
  const addBet = async (betData: Bet) => {
    if (!user) {
      setError("You must be logged in to place bets.");
      return;
    }

    try {
      // Optimistic Update
      setBets((prev) => [betData, ...prev]);

      const payload = { ...betData, user_id: user.id };

      // Ensure createdAt is compatible (Postgres often prefers ISO string for timestamptz)
      // If betData.createdAt is number, convert to ISO?
      // For now, let's keep sending number as previously attempted, but user_id was likely the blocker.
      // If createdAt failure persists, we will convert.

      const { error: insertError } = await supabase
        .from("bets")
        .insert([payload]);
      if (insertError) throw insertError;

      // No full refresh needed if optimistic update is correct,
      // but good to sync eventually. For now, we trust the optimistic update.
    } catch (err: any) {
      console.error("Error adding bet:", err);
      setError(err.message || "Failed to add bet");
      // Revert optimistic update
      setBets((prev) => prev.filter((b) => b.id !== betData.id));
    }
  };

  // Action: Update Bet Status
  const updateBetStatus = async (id: string, status: BetStatus) => {
    if (!user) {
      setError("You must be logged in to update bets.");
      return;
    }
    try {
      // Optimistic Update
      setBets((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));

      const { error: updateError } = await supabase
        .from("bets")
        .update({ status })
        .eq("id", id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
    } catch (err: any) {
      console.error("Error updating bet status:", err);
      setError(err.message || "Failed to update bet status");
      await fetchData(); // Revert
    }
  };

  // Action: Update Bet Details
  const updateBet = async (updatedBet: Bet) => {
    if (!user) {
      setError("You must be logged in to update bets.");
      return;
    }
    try {
      // Optimistic Update
      setBets((prev) =>
        prev.map((b) => (b.id === updatedBet.id ? updatedBet : b)),
      );

      const { error: updateError } = await supabase
        .from("bets")
        .update({
          matchup: updatedBet.matchup,
          pick: updatedBet.pick,
          odds: updatedBet.odds,
          wager: updatedBet.wager,
          potentialProfit: updatedBet.potentialProfit,
          sportsbook: updatedBet.sportsbook,
          tags: updatedBet.tags,
        })
        .eq("id", updatedBet.id)
        .eq("user_id", user.id);

      if (updateError) throw updateError;
    } catch (err: any) {
      console.error("Error updating bet:", err);
      setError(err.message || "Failed to update bet");
      await fetchData(); // Revert
    }
  };

  // Action: Delete Bet
  const deleteBet = async (id: string) => {
    if (!user) {
      setError("You must be logged in to delete bets.");
      return;
    }
    try {
      // Optimistic Update
      const previousBets = [...bets];
      setBets((prev) => prev.filter((b) => b.id !== id));

      const { error: deleteError } = await supabase
        .from("bets")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (deleteError) {
        // Revert
        setBets(previousBets);
        throw deleteError;
      }
    } catch (err: any) {
      console.error("Error deleting bet:", err);
      setError(err.message || "Failed to delete bet");
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
    updateBookBalance,
    addBet,
    updateBetStatus,
    updateBet,
    deleteBet,
    getKellyWager,
  };
};
