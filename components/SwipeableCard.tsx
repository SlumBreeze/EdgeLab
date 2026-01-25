import React, { useRef, useState, useCallback, useEffect } from "react";

// ============================================
// TYPES
// ============================================

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void; // Triggered when swiped left past threshold
  onSwipeRight?: () => void; // Triggered when swiped right past threshold
  leftAction?: {
    // Content revealed when swiping LEFT
    label: string;
    icon: string;
    color: string; // Tailwind bg class like 'bg-red-500'
  };
  rightAction?: {
    // Content revealed when swiping RIGHT
    label: string;
    icon: string;
    color: string;
  };
  threshold?: number; // Percentage of card width to trigger action (default 0.3)
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
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [willTrigger, setWillTrigger] = useState(false);

  // Refs for event listener access to latest state without re-binding
  const stateRef = useRef({
    isDragging,
    startX,
    startY,
    isHorizontalSwipe: null as boolean | null,
    translateX,
  });

  // Sync state to ref
  useEffect(() => {
    stateRef.current = {
      isDragging,
      startX,
      startY,
      isHorizontalSwipe: stateRef.current.isHorizontalSwipe,
      translateX,
    };
  }, [isDragging, startX, startY, translateX]);

  const getThresholdPx = useCallback(() => {
    if (!containerRef.current) return 100;
    return containerRef.current.offsetWidth * threshold;
  }, [threshold]);

  // Touch Start (React Event - Passive OK)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    const touch = e.touches[0];
    setStartX(touch.clientX);
    setStartY(touch.clientY);
    setIsDragging(true);
    stateRef.current.isHorizontalSwipe = null;
  };

  // Touch Move (Native Non-Passive Listener)
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (!stateRef.current.isDragging || disabled) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - stateRef.current.startX;
      const deltaY = touch.clientY - stateRef.current.startY;

      // Determine direction once
      if (stateRef.current.isHorizontalSwipe === null) {
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          stateRef.current.isHorizontalSwipe =
            Math.abs(deltaX) > Math.abs(deltaY);
        } else {
          return; // Wait for more movement
        }
      }

      // If vertical, let browser scroll
      if (!stateRef.current.isHorizontalSwipe) return;

      // If horizontal, prevent browser navigation/scroll
      if (e.cancelable) e.preventDefault();

      let constrainedDeltaX = deltaX;

      // Constrain based on available actions
      if (deltaX < 0 && !leftAction) constrainedDeltaX = 0;
      if (deltaX > 0 && !rightAction) constrainedDeltaX = 0;

      // Resistance
      const maxSwipe = element.offsetWidth * threshold * 1.5;
      if (Math.abs(constrainedDeltaX) > maxSwipe) {
        const overflow = Math.abs(constrainedDeltaX) - maxSwipe;
        const resistance = 1 - overflow / (overflow + 100);
        constrainedDeltaX =
          Math.sign(constrainedDeltaX) *
          (maxSwipe + overflow * resistance * 0.3);
      }

      setTranslateX(constrainedDeltaX);
      setWillTrigger(
        Math.abs(constrainedDeltaX) > element.offsetWidth * threshold,
      );
    };

    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => element.removeEventListener("touchmove", handleTouchMove);
  }, [disabled, leftAction, rightAction, threshold]);

  // Touch End (React Event)
  const handleTouchEnd = () => {
    if (!isDragging || disabled) return;

    setIsDragging(false);
    stateRef.current.isHorizontalSwipe = null;

    const thresholdPx = getThresholdPx();

    if (translateX < -thresholdPx && onSwipeLeft) {
      setTranslateX(-containerRef.current!.offsetWidth);
      setTimeout(() => {
        onSwipeLeft();
        setTimeout(() => setTranslateX(0), 100);
      }, 200);
    } else if (translateX > thresholdPx && onSwipeRight) {
      setTranslateX(containerRef.current!.offsetWidth);
      setTimeout(() => {
        onSwipeRight();
        setTimeout(() => setTranslateX(0), 100);
      }, 200);
    } else {
      setTranslateX(0);
    }
    setWillTrigger(false);
  };

  // Opacity Calcs
  const leftActionOpacity = Math.min(
    1,
    Math.abs(Math.min(0, translateX)) / getThresholdPx(),
  );
  const rightActionOpacity = Math.min(
    1,
    Math.max(0, translateX) / getThresholdPx(),
  );

  return (
    <div className="relative overflow-hidden rounded-2xl h-full">
      {/* Right Action (Revealed on Swipe Right) */}
      {rightAction && (
        <div
          className={`absolute inset-y-0 left-0 w-24 ${rightAction.color} flex items-center justify-center transition-opacity duration-150`}
          style={{ opacity: rightActionOpacity }}
        >
          <div
            className={`flex flex-col items-center text-white transition-transform duration-150 ${
              willTrigger && translateX > 0 ? "scale-110" : "scale-100"
            }`}
          >
            <span className="text-2xl mb-1">{rightAction.icon}</span>
            <span className="text-xs font-bold uppercase tracking-wide">
              {rightAction.label}
            </span>
          </div>
        </div>
      )}

      {/* Left Action (Revealed on Swipe Left - mapped to leftAction prop) */}
      {leftAction && (
        <div
          className={`absolute inset-y-0 right-0 w-24 ${leftAction.color} flex items-center justify-center transition-opacity duration-150`}
          style={{ opacity: leftActionOpacity }}
        >
          <div
            className={`flex flex-col items-center text-white transition-transform duration-150 ${
              willTrigger && translateX < 0 ? "scale-110" : "scale-100"
            }`}
          >
            <span className="text-2xl mb-1">{leftAction.icon}</span>
            <span className="text-xs font-bold uppercase tracking-wide">
              {leftAction.label}
            </span>
          </div>
        </div>
      )}

      {/* Card Content */}
      <div
        ref={containerRef}
        className={`relative bg-transparent ${isDragging ? "" : "transition-transform duration-200 ease-out"}`}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeableCard;
