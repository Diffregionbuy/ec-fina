'use client';

import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef } from 'react';

// State management types
interface OptimizedState {
  cache: Map<string, { data: any; timestamp: number; ttl: number }>;
  loading: Set<string>;
  errors: Map<string, string>;
  subscriptions: Map<string, Set<() => void>>;
}

type OptimizedAction = 
  | { type: 'SET_CACHE'; key: string; data: any; ttl?: number }
  | { type: 'CLEAR_CACHE'; pattern?: string }
  | { type: 'SET_LOADING'; key: string; loading: boolean }
  | { type: 'SET_ERROR'; key: string; error: string | null }
  | { type: 'SUBSCRIBE'; key: string; callback: () => void }
  | { type: 'UNSUBSCRIBE'; key: string; callback: () => void };

// Initial state
const initialState: OptimizedState = {
  cache: new Map(),
  loading: new Set(),
  errors: new Map(),
  subscriptions: new Map(),
};

// Reducer with optimized state updates
function optimizedReducer(state: OptimizedState, action: OptimizedAction): OptimizedState {
  switch (action.type) {
    case 'SET_CACHE': {
      const newCache = new Map(state.cache);
      newCache.set(action.key, {
        data: action.data,
        timestamp: Date.now(),
        ttl: action.ttl || 5 * 60 * 1000, // 5 minutes default
      });
      return { ...state, cache: newCache };
    }

    case 'CLEAR_CACHE': {
      const newCache = new Map(state.cache);
      if (action.pattern) {
        const regex = new RegExp(action.pattern);
        for (const key of newCache.keys()) {
          if (regex.test(key)) {
            newCache.delete(key);
          }
        }
      } else {
        newCache.clear();
      }
      return { ...state, cache: newCache };
    }

    case 'SET_LOADING': {
      const newLoading = new Set(state.loading);
      if (action.loading) {
        newLoading.add(action.key);
      } else {
        newLoading.delete(action.key);
      }
      return { ...state, loading: newLoading };
    }

    case 'SET_ERROR': {
      const newErrors = new Map(state.errors);
      if (action.error) {
        newErrors.set(action.key, action.error);
      } else {
        newErrors.delete(action.key);
      }
      return { ...state, errors: newErrors };
    }

    case 'SUBSCRIBE': {
      const newSubscriptions = new Map(state.subscriptions);
      const callbacks = newSubscriptions.get(action.key) || new Set();
      callbacks.add(action.callback);
      newSubscriptions.set(action.key, callbacks);
      return { ...state, subscriptions: newSubscriptions };
    }

    case 'UNSUBSCRIBE': {
      const newSubscriptions = new Map(state.subscriptions);
      const callbacks = newSubscriptions.get(action.key);
      if (callbacks) {
        callbacks.delete(action.callback);
        if (callbacks.size === 0) {
          newSubscriptions.delete(action.key);
        }
      }
      return { ...state, subscriptions: newSubscriptions };
    }

    default:
      return state;
  }
}

// Context
interface OptimizedStateContextValue {
  // Cache operations
  getCachedData: <T>(key: string) => T | null;
  setCachedData: <T>(key: string, data: T, ttl?: number) => void;
  clearCache: (pattern?: string) => void;
  
  // Loading state
  isLoading: (key: string) => boolean;
  setLoading: (key: string, loading: boolean) => void;
  
  // Error state
  getError: (key: string) => string | null;
  setError: (key: string, error: string | null) => void;
  
  // Subscription system
  subscribe: (key: string, callback: () => void) => () => void;
  notify: (key: string) => void;
  
  // Batch operations
  batchUpdate: (updates: () => void) => void;
}

const OptimizedStateContext = createContext<OptimizedStateContextValue | null>(null);

// Provider component
export function OptimizedStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(optimizedReducer, initialState);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<(() => void)[]>([]);

  // Cache operations
  const getCachedData = useCallback(<T,>(key: string): T | null => {
    const cached = state.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      dispatch({ type: 'CLEAR_CACHE', pattern: `^${key}$` });
      return null;
    }
    
    return cached.data as T;
  }, [state.cache]);

  const setCachedData = useCallback(<T,>(key: string, data: T, ttl?: number) => {
    dispatch({ type: 'SET_CACHE', key, data, ttl });
  }, []);

  const clearCache = useCallback((pattern?: string) => {
    dispatch({ type: 'CLEAR_CACHE', pattern });
  }, []);

  // Loading state
  const isLoading = useCallback((key: string): boolean => {
    return state.loading.has(key);
  }, [state.loading]);

  const setLoading = useCallback((key: string, loading: boolean) => {
    dispatch({ type: 'SET_LOADING', key, loading });
  }, []);

  // Error state
  const getError = useCallback((key: string): string | null => {
    return state.errors.get(key) || null;
  }, [state.errors]);

  const setError = useCallback((key: string, error: string | null) => {
    dispatch({ type: 'SET_ERROR', key, error });
  }, []);

  // Subscription system
  const subscribe = useCallback((key: string, callback: () => void) => {
    dispatch({ type: 'SUBSCRIBE', key, callback });
    
    return () => {
      dispatch({ type: 'UNSUBSCRIBE', key, callback });
    };
  }, []);

  const notify = useCallback((key: string) => {
    const callbacks = state.subscriptions.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback());
    }
  }, [state.subscriptions]);

  // Batch operations
  const batchUpdate = useCallback((updates: () => void) => {
    pendingUpdatesRef.current.push(updates);
    
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
    
    batchTimeoutRef.current = setTimeout(() => {
      const updates = pendingUpdatesRef.current;
      pendingUpdatesRef.current = [];
      
      updates.forEach(update => update());
      batchTimeoutRef.current = null;
    }, 0);
  }, []);

  // Memoized context value
  const contextValue = useMemo(() => ({
    getCachedData,
    setCachedData,
    clearCache,
    isLoading,
    setLoading,
    getError,
    setError,
    subscribe,
    notify,
    batchUpdate,
  }), [
    getCachedData,
    setCachedData,
    clearCache,
    isLoading,
    setLoading,
    getError,
    setError,
    subscribe,
    notify,
    batchUpdate,
  ]);

  return (
    <OptimizedStateContext.Provider value={contextValue}>
      {children}
    </OptimizedStateContext.Provider>
  );
}

// Hook to use the context
export function useOptimizedState() {
  const context = useContext(OptimizedStateContext);
  if (!context) {
    throw new Error('useOptimizedState must be used within OptimizedStateProvider');
  }
  return context;
}

// Specialized hooks for common patterns
export function useOptimizedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    ttl?: number;
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const { getCachedData, setCachedData, isLoading, setLoading, getError, setError } = useOptimizedState();
  const { ttl = 5 * 60 * 1000, enabled = true, onSuccess, onError } = options;

  const data = getCachedData<T>(key);
  const loading = isLoading(key);
  const error = getError(key);

  const refetch = useCallback(async () => {
    if (!enabled) return;

    setLoading(key, true);
    setError(key, null);

    try {
      const result = await fetcher();
      setCachedData(key, result, ttl);
      onSuccess?.(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(key, errorMessage);
      onError?.(err as Error);
      throw err;
    } finally {
      setLoading(key, false);
    }
  }, [key, fetcher, enabled, ttl, setCachedData, setLoading, setError, onSuccess, onError]);

  // Auto-fetch if no data and enabled
  React.useEffect(() => {
    if (enabled && !data && !loading && !error) {
      refetch();
    }
  }, [enabled, data, loading, error, refetch]);

  return {
    data,
    loading,
    error,
    refetch,
  };
}

// Hook for optimized form state
export function useOptimizedForm<T extends Record<string, any>>(
  initialValues: T,
  options: {
    validate?: (values: T) => Partial<Record<keyof T, string>>;
    onSubmit?: (values: T) => Promise<void> | void;
  } = {}
) {
  const [values, setValues] = React.useState<T>(initialValues);
  const [errors, setErrors] = React.useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = React.useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { validate, onSubmit } = options;

  // Memoized validation
  const validationErrors = useMemo(() => {
    return validate ? validate(values) : {};
  }, [values, validate]);

  // Update errors when validation changes
  React.useEffect(() => {
    setErrors(validationErrors);
  }, [validationErrors]);

  // Optimized field update
  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  // Optimized field blur
  const blurField = useCallback(<K extends keyof T>(field: K) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  }, []);

  // Reset form
  const reset = useCallback((newValues?: Partial<T>) => {
    setValues(newValues ? { ...initialValues, ...newValues } : initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  // Submit handler
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!onSubmit) return;

    // Mark all fields as touched
    const allTouched = Object.keys(values).reduce((acc, key) => {
      acc[key as keyof T] = true;
      return acc;
    }, {} as Partial<Record<keyof T, boolean>>);
    setTouched(allTouched);

    // Check for validation errors
    const currentErrors = validate ? validate(values) : {};
    if (Object.keys(currentErrors).length > 0) {
      setErrors(currentErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    updateField,
    blurField,
    reset,
    handleSubmit,
    isValid: Object.keys(validationErrors).length === 0,
  };
}