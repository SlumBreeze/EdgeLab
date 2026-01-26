
import React from 'react';
import { useGameContext } from '../hooks/useGameContext';
import { BankrollModal as TrackerBankrollModal } from './tracker/TrackerBankrollModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * EdgeLab Bankroll Modal Wrapper
 * 
 * This component acts as a bridge between the EdgeLab UI and the new Tracker bankroll management logic.
 * It uses GameContext which is now powered by the useBankroll hook.
 */
export const BankrollModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { 
    bookBalances, 
    totalBankroll, 
    updateBookBalance
  } = useGameContext();

  // NOTE: TrackerBankrollModal currently only handles book balances.
  // EdgeLab-specific features (Unit Size Slider, Sync ID) are temporarily hidden
  // to prioritize the unified bankroll manager as requested.
  
  return (
    <TrackerBankrollModal 
      isOpen={isOpen}
      onClose={onClose}
      bookBalances={bookBalances}
      totalBankroll={totalBankroll}
      onUpdateBookBalance={updateBookBalance}
    />
  );
};
