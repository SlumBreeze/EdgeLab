
import React, { useRef, useState, useCallback, useEffect } from 'react';

// ============================================
// TYPES
// ============================================

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;  // Should return a promise that resolves when refresh is complete
  disabled?: boolean;
  pullThreshold?: number;          // Pixels to pull before triggering (default 80)
  maxPull?: number;                // Maximum pull distance (default 120)
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
  const [startY, setStartY] = useState(0);
  const [canPull, setCanPull] = useState(false);

  // Check if we're at the top of the scroll container
  const isAtTop = useCallback(() => {
    if (!containerRef.current) return false;
    return containerRef.current.scrollTop <= 0;
  }, []);

  // Touch Start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    // Only enable pull if we're at the top
    if (isAtTop()) {
      setStartY(e.touches[0].clientY);
      setCanPull(true);
    } else {
      setCanPull(false);
    }
  }, [disabled, isRefreshing, isAtTop]);

  // Touch Move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing || !canPull) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    // Only activate if pulling down and we're at the top
    if (deltaY > 0 && isAtTop()) {
      // Apply resistance to make it feel natural
      // The further you pull, the harder it gets
      const resistance = 0.4;
      const resistedPull = Math.min(maxPull, deltaY * resistance);
      
      setPullDistance(resistedPull);
      setIsPulling(true);

      // Prevent default scroll behavior while pulling
      if (resistedPull > 10) {
        e.preventDefault(); // This is safe in React 18+ generally, but be mindful of passive listeners
      }
    } else if (deltaY < 0 && isPulling) {
      // User started pushing back up - reset
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [disabled, isRefreshing, canPull, startY, isPulling, maxPull, isAtTop]);

  // Touch End
  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing || !isPulling) return;

    setIsPulling(false);
    setCanPull(false);

    // Check if we pulled past the threshold
    if (pullDistance >= pullThreshold) {
      // Trigger refresh
      setIsRefreshing(true);
      setPullDistance(60); // Hold at a visible position during refresh
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        // Animate back to zero
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      // Didn't pull far enough - snap back
      setPullDistance(0);
    }
  }, [disabled, isRefreshing, isPulling, pullDistance, pullThreshold, onRefresh]);

  // Calculate visual states
  const pullProgress = Math.min(1, pullDistance / pullThreshold);
  const isReady = pullDistance >= pullThreshold && !isRefreshing;
  
  // Spinner rotation during refresh
  const [spinnerRotation, setSpinnerRotation] = useState(0);
  
  useEffect(() => {
    if (!isRefreshing) {
      setSpinnerRotation(0);
      return;
    }
    
    const interval = setInterval(() => {
      setSpinnerRotation(prev => prev + 30);
    }, 50);
    
    return () => clearInterval(interval);
  }, [isRefreshing]);

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-y-contain"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Pull Indicator */}
      <div 
        className={`
          flex items-center justify-center overflow-hidden
          transition-all duration-200 ease-out
        `}
        style={{ 
          height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 60 : 0) : 0,
          opacity: isRefreshing ? 1 : pullProgress
        }}
      >
        <div className="flex flex-col items-center py-2">
          {/* Animated Spinner/Arrow */}
          <div 
            className={`
              w-8 h-8 rounded-full flex items-center justify-center
              transition-all duration-200 shadow-sm
              ${isReady ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-400 border border-slate-200'}
              ${isRefreshing ? 'bg-coral-500 text-white border-none' : ''}
            `}
            style={{ 
              transform: isRefreshing 
                ? `rotate(${spinnerRotation}deg)` 
                : `rotate(${pullProgress * 180}deg)` 
            }}
          >
            {isRefreshing ? (
              // Spinner icon
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle 
                  className="opacity-25" 
                  cx="12" cy="12" r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              // Arrow icon
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
          
          {/* Status Text */}
          <span className={`
            text-[10px] font-bold uppercase tracking-wide mt-1 transition-colors duration-200
            ${isRefreshing ? 'text-coral-500' : isReady ? 'text-teal-600' : 'text-slate-400'}
          `}>
            {isRefreshing 
              ? 'Refreshing...' 
              : isReady 
                ? 'Release' 
                : 'Pull to refresh'
            }
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        transform: pullDistance > 0 && !isRefreshing ? `translateY(0)` : 'translateY(0)',
        transition: isPulling ? 'none' : 'transform 0.2s ease-out'
      }}>
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
