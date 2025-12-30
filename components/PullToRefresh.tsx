import React, { useRef, useState, useCallback, useEffect } from 'react';

// ============================================
// TYPES
// ============================================

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  pullThreshold?: number;
  maxPull?: number;
}

// ============================================
// COMPONENT
// ============================================

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  children,
  onRefresh,
  disabled = false,
  pullThreshold = 80,
  maxPull = 120
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  
  // State Refs for Event Listener
  const stateRef = useRef({
    startY: 0,
    isPulling: false,
    canPull: false,
    pullDistance: 0
  });

  // Sync state
  useEffect(() => {
    stateRef.current.isPulling = isPulling;
    stateRef.current.pullDistance = pullDistance;
  }, [isPulling, pullDistance]);

  const isAtTop = useCallback(() => {
    if (!containerRef.current) return false;
    return containerRef.current.scrollTop <= 0;
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    if (isAtTop()) {
      stateRef.current.startY = e.touches[0].clientY;
      stateRef.current.canPull = true;
    } else {
      stateRef.current.canPull = false;
    }
  };

  // Non-passive touch move listener
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (disabled || isRefreshing || !stateRef.current.canPull) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - stateRef.current.startY;

      if (deltaY > 0 && isAtTop()) {
        // Prevent native scroll
        if (e.cancelable) e.preventDefault();

        const resistance = 0.4;
        const resistedPull = Math.min(maxPull, deltaY * resistance);
        
        setPullDistance(resistedPull);
        setIsPulling(true);
      } else if (deltaY < 0 && stateRef.current.isPulling) {
        setPullDistance(0);
        setIsPulling(false);
      }
    };

    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => element.removeEventListener('touchmove', handleTouchMove);
  }, [disabled, isRefreshing, maxPull, isAtTop]);

  const handleTouchEnd = async () => {
    if (disabled || isRefreshing || !isPulling) return;

    setIsPulling(false);
    stateRef.current.canPull = false;

    if (pullDistance >= pullThreshold) {
      setIsRefreshing(true);
      setPullDistance(60);
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const pullProgress = Math.min(1, pullDistance / pullThreshold);
  const isReady = pullDistance >= pullThreshold && !isRefreshing;
  
  const [spinnerRotation, setSpinnerRotation] = useState(0);
  useEffect(() => {
    if (!isRefreshing) {
      setSpinnerRotation(0);
      return;
    }
    const interval = setInterval(() => setSpinnerRotation(prev => prev + 30), 50);
    return () => clearInterval(interval);
  }, [isRefreshing]);

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-y-contain"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div 
        className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
        style={{ 
          height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 60 : 0) : 0,
          opacity: isRefreshing ? 1 : pullProgress
        }}
      >
        <div className="flex flex-col items-center py-2">
          <div 
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-sm
              ${isReady ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-400 border border-slate-200'}
              ${isRefreshing ? 'bg-coral-500 text-white border-none' : ''}
            `}
            style={{ transform: isRefreshing ? `rotate(${spinnerRotation}deg)` : `rotate(${pullProgress * 180}deg)` }}
          >
            {isRefreshing ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wide mt-1 transition-colors duration-200
            ${isRefreshing ? 'text-coral-500' : isReady ? 'text-teal-600' : 'text-slate-400'}
          `}>
            {isRefreshing ? 'Refreshing...' : isReady ? 'Release' : 'Pull to refresh'}
          </span>
        </div>
      </div>

      <div style={{ 
        transform: `translateY(0)`, // Transform handled by margin/height of indicator above
        transition: isPulling ? 'none' : 'transform 0.2s ease-out'
      }}>
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;