
import React, { useRef, useState, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;      // Triggered when swiped left past threshold
  onSwipeRight?: () => void;     // Triggered when swiped right past threshold
  leftAction?: {                 // Content revealed when swiping LEFT (Mapped to left prop for Queue.tsx compatibility)
    label: string;
    icon: string;
    color: string;               // Tailwind bg class like 'bg-red-500'
  };
  rightAction?: {                // Content revealed when swiping RIGHT
    label: string;
    icon: string;
    color: string;
  };
  threshold?: number;            // Percentage of card width to trigger action (default 0.3)
  disabled?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const SwipeableCard: React.FC<SwipeableCardProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  threshold = 0.3,
  disabled = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState<boolean | null>(null);

  // Track whether we should trigger the action
  const [willTrigger, setWillTrigger] = useState(false);

  const getThresholdPx = useCallback(() => {
    if (!containerRef.current) return 100;
    return containerRef.current.offsetWidth * threshold;
  }, [threshold]);

  // Touch Start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    
    const touch = e.touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setIsDragging(true);
    setIsHorizontalSwipe(null); // Reset direction detection
  }, [disabled]);

  // Touch Move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || disabled) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    // First significant movement determines if this is horizontal or vertical scroll
    if (isHorizontalSwipe === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      setIsHorizontalSwipe(isHorizontal);
      
      if (!isHorizontal) {
        // Vertical scroll - abort swipe handling
        setIsDragging(false);
        return;
      }
    }

    // If we determined this is vertical scrolling, don't interfere
    if (isHorizontalSwipe === false) return;

    // Horizontal swipe handling
    if (isHorizontalSwipe === true) {
      // Prevent vertical scroll while swiping horizontally
      e.preventDefault();
    }

    let constrainedDeltaX = deltaX;
    
    // Logic: Swipe Left (deltaX < 0) reveals the content on the RIGHT.
    // In this app, Queue.tsx passes `leftAction` for the remove action.
    // We map `leftAction` prop to the content revealed by swiping LEFT (appearing on the right).
    if (deltaX < 0 && !leftAction) constrainedDeltaX = 0;
    if (deltaX > 0 && !rightAction) constrainedDeltaX = 0;

    // Apply resistance at the edges (rubber band effect)
    const maxSwipe = getThresholdPx() * 1.5;
    if (Math.abs(constrainedDeltaX) > maxSwipe) {
      const overflow = Math.abs(constrainedDeltaX) - maxSwipe;
      const resistance = 1 - (overflow / (overflow + 100)); // Diminishing returns
      constrainedDeltaX = Math.sign(constrainedDeltaX) * (maxSwipe + overflow * resistance * 0.3);
    }

    setTranslateX(constrainedDeltaX);

    // Check if we're past the threshold
    const thresholdPx = getThresholdPx();
    setWillTrigger(Math.abs(constrainedDeltaX) > thresholdPx);
  }, [isDragging, disabled, startX, startY, isHorizontalSwipe, leftAction, rightAction, getThresholdPx]);

  // Touch End
  const handleTouchEnd = useCallback(() => {
    if (!isDragging || disabled) return;

    setIsDragging(false);
    setIsHorizontalSwipe(null);

    const thresholdPx = getThresholdPx();

    // Check if swipe exceeded threshold
    if (translateX < -thresholdPx && onSwipeLeft) {
      // Animate off-screen to the left, then trigger action
      setTranslateX(-containerRef.current!.offsetWidth);
      setTimeout(() => {
        onSwipeLeft();
        // Reset after action
        setTimeout(() => setTranslateX(0), 100); 
      }, 200);
    } else if (translateX > thresholdPx && onSwipeRight) {
      // Animate off-screen to the right, then trigger action
      setTranslateX(containerRef.current!.offsetWidth);
      setTimeout(() => {
        onSwipeRight();
        setTimeout(() => setTranslateX(0), 100);
      }, 200);
    } else {
      // Snap back to center
      setTranslateX(0);
    }

    setWillTrigger(false);
  }, [isDragging, disabled, translateX, onSwipeLeft, onSwipeRight, getThresholdPx]);

  // Calculate action reveal opacity based on swipe distance
  const leftActionOpacity = Math.min(1, Math.abs(Math.min(0, translateX)) / getThresholdPx());
  const rightActionOpacity = Math.min(1, Math.max(0, translateX) / getThresholdPx());

  return (
    <div 
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* Right Reveal (Shown when swiping RIGHT - mapped to rightAction prop) */}
      {rightAction && (
        <div 
          className={`absolute inset-y-0 left-0 w-24 ${rightAction.color} flex items-center justify-center transition-opacity duration-150`}
          style={{ opacity: rightActionOpacity }}
        >
          <div className={`flex flex-col items-center text-white transition-transform duration-150 ${
            willTrigger && translateX > 0 ? 'scale-110' : 'scale-100'
          }`}>
            <span className="text-2xl mb-1">{rightAction.icon}</span>
            <span className="text-xs font-bold uppercase tracking-wide">{rightAction.label}</span>
          </div>
        </div>
      )}

      {/* Left Reveal (Shown when swiping LEFT - mapped to leftAction prop) */}
      {leftAction && (
        <div 
          className={`absolute inset-y-0 right-0 w-24 ${leftAction.color} flex items-center justify-center transition-opacity duration-150`}
          style={{ opacity: leftActionOpacity }}
        >
          <div className={`flex flex-col items-center text-white transition-transform duration-150 ${
            willTrigger && translateX < 0 ? 'scale-110' : 'scale-100'
          }`}>
            <span className="text-2xl mb-1">{leftAction.icon}</span>
            <span className="text-xs font-bold uppercase tracking-wide">{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Main Content (slides on top) */}
      <div
        className={`relative bg-white ${isDragging ? '' : 'transition-transform duration-200 ease-out'}`}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeableCard;
