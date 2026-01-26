import React, { useState } from "react";
import { Wallet, Plus, Minus, X, AlertCircle, Target } from "lucide-react";
import { formatCurrency } from "../../utils/calculations";
import { BookBalanceDisplay } from "../../types";
import { SPORTSBOOK_THEME, SPORTSBOOKS } from "../../constants";

interface BankrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookBalances: BookBalanceDisplay[];
  onUpdateBookBalance: (
    sportsbook: string,
    updates: { deposited?: number; withdrawn?: number },
  ) => Promise<void> | void;
  totalBankroll: number;
}

export const BankrollModal: React.FC<BankrollModalProps> = ({
  isOpen,
  onClose,
  bookBalances,
  onUpdateBookBalance,
  totalBankroll,
}) => {
  const [editingBook, setEditingBook] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<"deposit" | "withdraw" | "set">("set");
  const [bulkInput, setBulkInput] = useState<string>("");
  const [bulkStatus, setBulkStatus] = useState<string>("");

  if (!isOpen) return null;

  const handleStartEdit = (
    book: string,
    defaultMode: "deposit" | "withdraw" | "set" = "set",
  ) => {
    const currentBook = bookBalances.find((b) => b.sportsbook === book);
    setEditingBook(book);
    setMode(defaultMode);
    if (defaultMode === "set" && currentBook) {
      setAmount(
        currentBook.currentBalance > 0
          ? currentBook.currentBalance.toFixed(2)
          : "",
      );
    } else {
      setAmount("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook) return;

    const val = parseFloat(amount);
    if (isNaN(val) || val < 0) return;

    const currentBook = bookBalances.find((b) => b.sportsbook === editingBook);
    if (!currentBook) return;

    if (mode === "deposit") {
      const newDeposit = currentBook.deposited + val;
      onUpdateBookBalance(editingBook, { deposited: newDeposit });
    } else if (mode === "withdraw") {
      const newWithdrawn = (currentBook.withdrawn || 0) + val;
      onUpdateBookBalance(editingBook, { withdrawn: newWithdrawn });
    } else if (mode === "set") {
      const pnl =
        currentBook.currentBalance -
        currentBook.deposited +
        (currentBook.withdrawn || 0);
      // Balance = Deposited - Withdrawn + PnL
      // User sets Balance.
      // We adjust Deposited to match.
      // NewDeposited = TargetBalance + Withdrawn - PnL
      const newDeposit = val + (currentBook.withdrawn || 0) - pnl;
      // Simplified: currentBalance - deposited = (pnl - withdrawn)
      // Delta = val - currentBook.currentBalance
      // NewDeposit = currentBook.deposited + Delta
      onUpdateBookBalance(editingBook, { deposited: newDeposit });
    }
    setEditingBook(null);
    setAmount("");
  };

  const findBookMatch = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return null;
    const exact = bookBalances.find(
      (b) => b.sportsbook.toLowerCase() === normalized,
    );
    if (exact) return exact;
    return (
      bookBalances.find((b) =>
        b.sportsbook.toLowerCase().includes(normalized),
      ) || null
    );
  };

  const handleBulkSync = async () => {
    const lines = bulkInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (!lines.length) return;

    let applied = 0;
    let skipped = 0;
    let lastError: string | null = null;

    for (const line of lines) {
      const match =
        line.match(/^(.+?)[\s:=\-]+\$?\s*(-?\d+(?:\.\d+)?)$/) || null;
      if (!match) {
        skipped += 1;
        continue;
      }

      const [, rawBook, rawAmount] = match;
      const book = findBookMatch(rawBook);
      if (!book) {
        skipped += 1;
        continue;
      }

      const target = parseFloat(rawAmount);
      if (Number.isNaN(target)) {
        skipped += 1;
        continue;
      }

      const withdrawn = book.withdrawn || 0;
      const pnl = book.currentBalance - book.deposited + withdrawn;
      const newDeposit = target + withdrawn - pnl;

      try {
        await onUpdateBookBalance(book.sportsbook, { deposited: newDeposit });
        applied += 1;
      } catch (err: any) {
        lastError =
          err?.message || "Failed to sync one or more bankroll entries.";
        skipped += 1;
      }
    }

    setBulkStatus(
      lastError
        ? `Synced ${applied} book(s). Skipped ${skipped}. Last error: ${lastError}`
        : `Synced ${applied} book(s). Skipped ${skipped}.`,
    );
    setTimeout(() => setBulkStatus(""), 2500);
  };

  const getBookTheme = (bookName: string) => {
    const key = SPORTSBOOKS.find((s) => s === bookName) || "Other";
    return SPORTSBOOK_THEME[key] || SPORTSBOOK_THEME["Other"];
  };

  const activeBooks = bookBalances.filter(
    (b) => b.deposited !== 0 || b.currentBalance !== 0,
  );
  const inactiveBooks = bookBalances.filter(
    (b) => b.deposited === 0 && b.currentBalance === 0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-base/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-ink-paper border border-ink-gray rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative flex flex-col max-h-[90vh] min-h-0 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-text/40 hover:text-ink-text transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-ink-base rounded-full flex items-center justify-center mb-3 shadow-inner">
            <Wallet size={24} className="text-ink-accent" />
          </div>
          <h2 className="text-xl font-bold text-ink-text">Manage Bankroll</h2>
          <p className="text-ink-text/60 text-sm mt-1 font-mono">
            Total:{" "}
            <span className="text-ink-text font-bold">
              {formatCurrency(totalBankroll)}
            </span>
          </p>
        </div>

        {/* Editing Overlay */}
        {editingBook && (
          <div className="absolute inset-0 z-10 bg-ink-paper/95 backdrop-blur-sm rounded-2xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-full max-w-sm">
              <h3 className="text-lg font-bold text-center mb-4 text-ink-text">
                Update {editingBook}
              </h3>

              <div className="flex p-1 bg-ink-base rounded-lg border border-ink-gray mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setMode("set");
                    setAmount(
                      bookBalances
                        .find((b) => b.sportsbook === editingBook)
                        ?.currentBalance.toFixed(2) || "",
                    );
                  }}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${mode === "set" ? "bg-ink-accent text-white shadow-sm" : "text-ink-text/60 hover:text-ink-text"}`}
                >
                  <Target size={12} /> Set
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("deposit");
                    setAmount("");
                  }}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${mode === "deposit" ? "bg-status-win text-white shadow-sm" : "text-ink-text/60 hover:text-ink-text"}`}
                >
                  <Plus size={12} /> Deposit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("withdraw");
                    setAmount("");
                  }}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${mode === "withdraw" ? "bg-status-loss text-white shadow-sm" : "text-ink-text/60 hover:text-ink-text"}`}
                >
                  <Minus size={12} /> Withdraw
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-text/40 text-lg">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      autoFocus
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-ink-base border border-ink-gray rounded-xl py-3 pl-8 pr-4 text-lg font-bold outline-none focus:border-ink-accent text-ink-text font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBook(null);
                      setAmount("");
                    }}
                    className="flex-1 py-3 bg-ink-base border border-ink-gray text-ink-text font-bold rounded-xl hover:bg-ink-gray/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 py-3 text-white font-bold rounded-xl ${mode === "withdraw" ? "bg-status-loss" : mode === "deposit" ? "bg-status-win" : "bg-ink-accent"}`}
                  >
                    Confirm
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="overflow-y-auto pr-2 -mr-2 space-y-3 flex-1 min-h-0 custom-scrollbar pb-24">
          <div className="p-4 bg-ink-base rounded-xl border border-ink-gray">
            <h4 className="text-xs font-bold text-ink-text/70 uppercase tracking-wider mb-2">
              Quick Sync (Paste Balances)
            </h4>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={`Example:\nFliff: 2.00\ntheScore Bet: 55.91\nFanDuel: 14.83\nDraftKings: 0.00\nBetOnline: 49.34`}
              className="w-full min-h-[110px] bg-ink-base border border-ink-gray rounded-lg p-3 text-xs font-mono text-ink-text/80 focus:border-ink-accent outline-none"
            />
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={handleBulkSync}
                className="px-3 py-2 rounded-lg bg-ink-accent text-white text-xs font-bold hover:bg-sky-500 transition-colors"
              >
                Sync Balances
              </button>
              {bulkStatus && (
                <span className="text-[10px] text-ink-text/50 font-medium">
                  {bulkStatus}
                </span>
              )}
            </div>
          </div>

          {activeBooks.map((book) => {
            const theme = getBookTheme(book.sportsbook);
            const pnl = book.currentBalance + (book.withdrawn || 0) - book.deposited;
            const isPositivePnL = pnl >= 0;
            return (
              <div
                key={book.sportsbook}
                className="flex items-center justify-between p-4 bg-ink-base rounded-xl border border-ink-gray hover:border-ink-gray/80 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-10 rounded-full"
                    style={{ backgroundColor: theme.bg }}
                  ></div>
                  <div>
                    <h4 className="font-bold text-ink-text text-sm">
                      {book.sportsbook}
                    </h4>
                    <p className="text-[10px] text-ink-text/60 font-medium">
                      In: {formatCurrency(book.deposited)}
                    </p>
                    {book.withdrawn > 0 && (
                      <p className="text-[10px] text-ink-text/40 font-medium">
                        Out: {formatCurrency(book.withdrawn)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono font-bold text-ink-text">
                      {formatCurrency(book.currentBalance)}
                    </p>
                    <p
                      className={`text-[10px] font-medium ${isPositivePnL ? "text-status-win" : "text-status-loss"}`}
                    >
                      {isPositivePnL ? "+" : ""}
                      {formatCurrency(pnl)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartEdit(book.sportsbook, "set")}
                    className="px-3 py-2 rounded-lg bg-ink-paper border border-ink-gray hover:text-ink-text hover:border-ink-accent text-ink-text/60 text-xs font-bold transition-all"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}

          {inactiveBooks.length > 0 && (
            <details className="group pt-2">
              <summary className="cursor-pointer text-xs font-bold text-ink-text/40 uppercase tracking-wider py-2 hover:text-ink-text/60 list-none flex items-center gap-2">
                <span className="group-open:rotate-90 transition-transform">
                  ▶
                </span>{" "}
                Add Books
              </summary>
              <div className="space-y-2 mt-2">
                {inactiveBooks.map((book) => (
                  <div
                    key={book.sportsbook}
                    className="flex items-center justify-between p-3 bg-ink-base/50 rounded-lg border border-ink-gray/50 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <span className="text-ink-text/80 text-sm ml-2">
                      {book.sportsbook}
                    </span>
                    <button
                      onClick={() => handleStartEdit(book.sportsbook, "set")}
                      className="px-3 py-1.5 rounded-lg bg-ink-paper border border-ink-gray text-ink-text/60 hover:text-ink-accent text-xs font-bold"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};
