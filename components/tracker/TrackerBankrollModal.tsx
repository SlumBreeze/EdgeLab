import React, { useState } from 'react';
import { Wallet, Plus, Minus, X, AlertCircle, Target } from 'lucide-react';
import { formatCurrency } from '../../utils/calculations';
import { BookBalanceDisplay } from '../../types';
import { SPORTSBOOK_THEME, SPORTSBOOKS } from '../../constants';

interface BankrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookBalances: BookBalanceDisplay[];
  onUpdateBookDeposit: (sportsbook: string, newDepositAmount: number) => void;
  totalBankroll: number;
}

export const BankrollModal: React.FC<BankrollModalProps> = ({ 
  isOpen, 
  onClose, 
  bookBalances,
  onUpdateBookDeposit,
  totalBankroll
}) => {
  const [editingBook, setEditingBook] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [mode, setMode] = useState<'deposit' | 'withdraw' | 'set'>('set');

  if (!isOpen) return null;

  const handleStartEdit = (book: string, defaultMode: 'deposit' | 'withdraw' | 'set' = 'set') => {
    const currentBook = bookBalances.find(b => b.sportsbook === book);
    setEditingBook(book);
    setMode(defaultMode);
    // Pre-fill with current balance for "set" mode
    if (defaultMode === 'set' && currentBook) {
      setAmount(currentBook.currentBalance > 0 ? currentBook.currentBalance.toFixed(2) : '');
    } else {
      setAmount('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBook) return;

    const val = parseFloat(amount);
    if (isNaN(val) || val < 0) return;

    const currentBook = bookBalances.find(b => b.sportsbook === editingBook);
    if (!currentBook) return;

    let newDeposit = currentBook.deposited;
    
    if (mode === 'deposit') {
      newDeposit += val;
    } else if (mode === 'withdraw') {
      newDeposit -= val;
      if (newDeposit < 0) newDeposit = 0;
    } else if (mode === 'set') {
      // "Set Balance" mode: Calculate what deposited needs to be
      // currentBalance = deposited + PnL
      // newBalance = newDeposit + PnL
      // newDeposit = newBalance - PnL
      // PnL = currentBalance - deposited
      const pnl = currentBook.currentBalance - currentBook.deposited;
      newDeposit = val - pnl;
    }

    onUpdateBookDeposit(editingBook, newDeposit);
    setEditingBook(null);
    setAmount('');
  };

  const getBookTheme = (bookName: string) => {
    const key = SPORTSBOOKS.find(s => s === bookName) || 'Other';
    return SPORTSBOOK_THEME[key] || SPORTSBOOK_THEME['Other'];
  };

  // Only show books with activity (deposited > 0 or has bets affecting balance)
  const activeBooks = bookBalances.filter(b => b.deposited !== 0 || b.currentBalance !== 0);
  const inactiveBooks = bookBalances.filter(b => b.deposited === 0 && b.currentBalance === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-ink-paper border border-ink-gray rounded-2xl w-full max-w-2xl p-6 shadow-2xl relative flex flex-col max-h-[90vh]">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-text/40 hover:text-ink-text transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-ink-accent/10 rounded-full flex items-center justify-center mb-3 shadow-sm">
            <Wallet size={24} className="text-ink-accent" />
          </div>
          <h2 className="text-xl font-bold text-ink-text">Manage Sportsbooks</h2>
          <p className="text-ink-text/60 text-sm mt-1">
             Total Bankroll: <span className="text-ink-text font-bold">{formatCurrency(totalBankroll)}</span>
          </p>
        </div>

        {/* Editing Overlay/Modal */}
        {editingBook && (
          <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm rounded-2xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-full max-w-sm">
              <h3 className="text-lg font-bold text-center mb-4 text-ink-text">Update {editingBook}</h3>
              
              {/* Mode Selector */}
              <div className="flex p-1 bg-ink-base rounded-lg border border-ink-gray mb-4">
                <button
                  type="button"
                  onClick={() => { setMode('set'); setAmount(bookBalances.find(b => b.sportsbook === editingBook)?.currentBalance.toFixed(2) || ''); }}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${mode === 'set' ? 'bg-ink-accent text-white shadow-sm' : 'text-ink-text/60 hover:text-ink-text'}`}
                >
                  <Target size={12} /> Set Balance
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('deposit'); setAmount(''); }}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${mode === 'deposit' ? 'bg-status-win text-white shadow-sm' : 'text-ink-text/60 hover:text-ink-text'}`}
                >
                  <Plus size={12} /> Deposit
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('withdraw'); setAmount(''); }}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${mode === 'withdraw' ? 'bg-status-loss text-white shadow-sm' : 'text-ink-text/60 hover:text-ink-text'}`}
                >
                  <Minus size={12} /> Withdraw
                </button>
              </div>

              {/* Helper text */}
              <p className="text-xs text-ink-text/60 mb-3 text-center">
                {mode === 'set' && "Enter your actual current balance on this book"}
                {mode === 'deposit' && "Enter the amount you're adding to this book"}
                {mode === 'withdraw' && "Enter the amount you're removing from this book"}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-ink-text/60 uppercase tracking-wider block mb-2">
                    {mode === 'set' ? 'Current Balance' : mode === 'deposit' ? 'Deposit Amount' : 'Withdraw Amount'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-text/40 text-lg">$</span>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.01" 
                      autoFocus
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-white border border-ink-gray rounded-xl py-3 pl-8 pr-4 text-lg font-bold outline-none focus:ring-2 focus:ring-ink-accent"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Preview for Set mode */}
                {mode === 'set' && amount && (
                  <div className="bg-ink-base/50 rounded-lg p-3 text-xs">
                    <div className="flex justify-between text-ink-text/60">
                      <span>Current shown:</span>
                      <span>{formatCurrency(bookBalances.find(b => b.sportsbook === editingBook)?.currentBalance || 0)}</span>
                    </div>
                    <div className="flex justify-between text-ink-text font-bold mt-1">
                      <span>Will become:</span>
                      <span>{formatCurrency(parseFloat(amount) || 0)}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => { setEditingBook(null); setAmount(''); }}
                    className="flex-1 py-3 bg-white border border-ink-gray text-ink-text font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className={`flex-1 py-3 text-white font-bold rounded-xl ${
                      mode === 'withdraw' ? 'bg-status-loss' : 
                      mode === 'deposit' ? 'bg-status-win' : 
                      'bg-ink-accent'
                    }`}
                  >
                    {mode === 'set' ? 'Set Balance' : 'Confirm'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="overflow-y-auto pr-2 -mr-2 space-y-3 flex-1">
          {/* Active Books */}
          {activeBooks.map(book => {
            const theme = getBookTheme(book.sportsbook);
            const hasFunds = book.currentBalance > 0.01;
            const isPositivePnL = book.currentBalance >= book.deposited;
            
            return (
              <div key={book.sportsbook} className="flex items-center justify-between p-4 bg-ink-base/50 rounded-xl border border-ink-gray hover:border-ink-accent/30 transition-all">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-2 h-10 rounded-full" 
                    style={{ backgroundColor: theme.bg }}
                  ></div>
                  <div>
                    <h4 className="font-bold text-ink-text text-sm">{book.sportsbook}</h4>
                    <p className="text-[10px] text-ink-text/60 font-medium">Deposited: {formatCurrency(book.deposited)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`font-mono font-bold ${hasFunds ? 'text-ink-text' : 'text-ink-text/40'}`}>
                      {formatCurrency(book.currentBalance)}
                    </p>
                    <p className={`text-[10px] font-medium ${isPositivePnL ? 'text-status-win' : 'text-status-loss'}`}>
                      {isPositivePnL ? '+' : ''}{formatCurrency(book.currentBalance - book.deposited)} PnL
                    </p>
                  </div>

                  <button 
                    onClick={() => handleStartEdit(book.sportsbook, 'set')}
                    className="px-3 py-2 rounded-lg bg-white border border-ink-gray hover:bg-ink-accent hover:text-white hover:border-ink-accent text-ink-text/60 text-xs font-bold transition-all"
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}

          {/* Inactive Books (Collapsible) */}
          {inactiveBooks.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-bold text-ink-text/40 uppercase tracking-wider py-2 hover:text-ink-text/60 list-none flex items-center gap-2">
                <span className="group-open:rotate-90 transition-transform">▶</span>
                Add More Books ({inactiveBooks.length} available)
              </summary>
              <div className="space-y-2 mt-2">
                {inactiveBooks.map(book => {
                  const theme = getBookTheme(book.sportsbook);
                  return (
                    <div key={book.sportsbook} className="flex items-center justify-between p-3 bg-ink-base/30 rounded-lg border border-ink-gray/50">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-1.5 h-8 rounded-full opacity-50" 
                          style={{ backgroundColor: theme.bg }}
                        ></div>
                        <span className="text-ink-text/60 text-sm">{book.sportsbook}</span>
                      </div>
                      <button 
                        onClick={() => handleStartEdit(book.sportsbook, 'set')}
                        className="px-3 py-1.5 rounded-lg bg-white border border-ink-gray hover:border-ink-accent text-ink-text/40 hover:text-ink-accent text-xs font-bold transition-all"
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
        
        <div className="mt-6 pt-4 border-t border-ink-gray flex justify-between items-center">
          <p className="text-xs text-ink-text/40 flex items-center gap-1">
            <AlertCircle size={12}/>
            Use "Set Balance" to match your actual book balance
          </p>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-ink-text text-white text-sm font-bold rounded-lg hover:bg-ink-text/80 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

