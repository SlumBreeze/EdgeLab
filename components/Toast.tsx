
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// ============================================
// TYPES
// ============================================

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number; // ms, defaults to 4000
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

// ============================================
// CONTEXT
// ============================================

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = { ...toast, id, duration: toast.duration || 4000 };
    
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, newToast.duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// ============================================
// TOAST CONTAINER (renders all active toasts)
// ============================================

const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({ 
  toasts, 
  onRemove 
}) => {
  // Position above the bottom nav (which is h-16 = 64px)
  // We'll stack toasts from the bottom up
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast, index) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onRemove={() => onRemove(toast.id)}
          index={index}
        />
      ))}
    </div>
  );
};

// ============================================
// INDIVIDUAL TOAST ITEM
// ============================================

const ToastItem: React.FC<{ 
  toast: Toast; 
  onRemove: () => void;
  index: number;
}> = ({ toast, onRemove, index }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(true);

  // Entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 50);
    return () => clearTimeout(timer);
  }, []);

  // Start exit animation before removal
  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, (toast.duration || 4000) - 300); // Start exit 300ms before removal

    return () => clearTimeout(exitTimer);
  }, [toast.duration]);

  // Styling based on toast type
  const getTypeStyles = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'bg-ink-paper',
          icon: '✅',
          border: 'border-l-status-win',
          accent: 'text-status-win'
        };
      case 'error':
        return {
          bg: 'bg-ink-paper',
          icon: '❌',
          border: 'border-l-status-loss',
          accent: 'text-status-loss'
        };
      case 'warning':
        return {
          bg: 'bg-ink-paper',
          icon: '⚠️',
          border: 'border-l-amber-400',
          accent: 'text-amber-300'
        };
      case 'info':
      default:
        return {
          bg: 'bg-ink-paper',
          icon: 'ℹ️',
          border: 'border-l-ink-accent',
          accent: 'text-ink-accent'
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div
      className={`
        ${styles.bg} ${styles.border}
        text-ink-text px-4 py-3 rounded-xl shadow-sm border border-ink-gray border-l-4
        flex items-center gap-3 pointer-events-auto
        transform transition-all duration-300 ease-out
        ${isEntering ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}
        ${isExiting ? 'translate-x-full opacity-0' : ''}
      `}
      onClick={onRemove}
      role="alert"
    >
      <span className={`text-lg flex-shrink-0 ${styles.accent}`}>{styles.icon}</span>
      <span className="text-sm font-medium flex-1">{toast.message}</span>
      <button 
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="text-white/60 hover:text-white transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
};

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

export const createToastHelpers = (addToast: ToastContextValue['addToast']) => ({
  showSuccess: (message: string, duration?: number) => 
    addToast({ type: 'success', message, duration }),
  showError: (message: string, duration?: number) => 
    addToast({ type: 'error', message, duration }),
  showWarning: (message: string, duration?: number) => 
    addToast({ type: 'warning', message, duration }),
  showInfo: (message: string, duration?: number) => 
    addToast({ type: 'info', message, duration }),
});
