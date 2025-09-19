import { useState, useCallback, useMemo, useRef } from 'react';

interface Toast {
  id: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  duration?: number;
}

interface ToastQueue {
  toasts: Toast[];
  maxToasts: number;
}

// Optimized toast hook with better performance
export const useOptimizedToast = (maxToasts = 5) => {
  const [queue, setQueue] = useState<ToastQueue>({ toasts: [], maxToasts });
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const idCounterRef = useRef(0);

  // Optimized ID generation
  const generateId = useCallback(() => {
    return `toast-${++idCounterRef.current}-${Date.now()}`;
  }, []);

  // Memoized toast operations
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = generateId();
    const newToast = { ...toast, id };
    
    setQueue(prev => {
      const newToasts = [...prev.toasts, newToast];
      // Remove oldest toasts if exceeding max
      if (newToasts.length > prev.maxToasts) {
        const removedToasts = newToasts.splice(0, newToasts.length - prev.maxToasts);
        // Clear timeouts for removed toasts
        removedToasts.forEach(removedToast => {
          const timeout = timeoutsRef.current.get(removedToast.id);
          if (timeout) {
            clearTimeout(timeout);
            timeoutsRef.current.delete(removedToast.id);
          }
        });
      }
      return { ...prev, toasts: newToasts };
    });
    
    // Auto remove after duration
    if (toast.duration !== 0) {
      const timeout = setTimeout(() => {
        removeToast(id);
      }, toast.duration || 5000);
      
      timeoutsRef.current.set(id, timeout);
    }
    
    return id;
  }, [generateId]);

  const removeToast = useCallback((id: string) => {
    // Clear timeout if exists
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    
    setQueue(prev => ({
      ...prev,
      toasts: prev.toasts.filter(toast => toast.id !== id)
    }));
  }, []);

  const clearAllToasts = useCallback(() => {
    // Clear all timeouts
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();
    
    setQueue(prev => ({ ...prev, toasts: [] }));
  }, []);

  // Memoized convenience methods
  const success = useCallback((title: string, description?: string, duration?: number) => {
    return addToast({ variant: 'success', title, description, duration });
  }, [addToast]);

  const error = useCallback((title: string, description?: string, duration?: number) => {
    return addToast({ variant: 'error', title, description, duration });
  }, [addToast]);

  const warning = useCallback((title: string, description?: string, duration?: number) => {
    return addToast({ variant: 'warning', title, description, duration });
  }, [addToast]);

  const info = useCallback((title: string, description?: string, duration?: number) => {
    return addToast({ variant: 'default', title, description, duration });
  }, [addToast]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  // Memoized return value
  return useMemo(() => ({
    toasts: queue.toasts,
    addToast,
    removeToast,
    clearAllToasts,
    success,
    error,
    warning,
    info,
  }), [queue.toasts, addToast, removeToast, clearAllToasts, success, error, warning, info]);
};

// Hook for toast notifications with deduplication
export const useOptimizedToastWithDedup = (maxToasts = 5, dedupWindow = 3000) => {
  const baseToast = useOptimizedToast(maxToasts);
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const addToastWithDedup = useCallback((toast: Omit<Toast, 'id'>) => {
    const key = `${toast.variant}-${toast.title}-${toast.description}`;
    const now = Date.now();
    const lastShown = recentToastsRef.current.get(key);

    // Skip if same toast was shown recently
    if (lastShown && now - lastShown < dedupWindow) {
      return null;
    }

    recentToastsRef.current.set(key, now);
    
    // Cleanup old entries
    for (const [entryKey, timestamp] of recentToastsRef.current.entries()) {
      if (now - timestamp > dedupWindow) {
        recentToastsRef.current.delete(entryKey);
      }
    }

    return baseToast.addToast(toast);
  }, [baseToast.addToast, dedupWindow]);

  const success = useCallback((title: string, description?: string, duration?: number) => {
    return addToastWithDedup({ variant: 'success', title, description, duration });
  }, [addToastWithDedup]);

  const error = useCallback((title: string, description?: string, duration?: number) => {
    return addToastWithDedup({ variant: 'error', title, description, duration });
  }, [addToastWithDedup]);

  const warning = useCallback((title: string, description?: string, duration?: number) => {
    return addToastWithDedup({ variant: 'warning', title, description, duration });
  }, [addToastWithDedup]);

  const info = useCallback((title: string, description?: string, duration?: number) => {
    return addToastWithDedup({ variant: 'default', title, description, duration });
  }, [addToastWithDedup]);

  return useMemo(() => ({
    ...baseToast,
    addToast: addToastWithDedup,
    success,
    error,
    warning,
    info,
  }), [baseToast, addToastWithDedup, success, error, warning, info]);
};