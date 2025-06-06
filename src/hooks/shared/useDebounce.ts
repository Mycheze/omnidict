import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Simple, stable debounce hook that prevents infinite loops
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return debouncedValue;
}

/**
 * Immediate + debounced values for optimal UX
 * Returns [immediateValue, debouncedValue] to eliminate input lag
 */
export function useImmediateDebounce<T>(
  value: T, 
  delay: number
): [T, T] {
  const debouncedValue = useDebounce(value, delay);
  return [value, debouncedValue];
}

/**
 * Stable debounced callback hook without memory leaks
 */
export function useDebouncedCallback<Args extends any[]>(
  callback: (...args: Args) => void,
  delay: number,
  deps: React.DependencyList = []
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref when dependencies change
  useEffect(() => {
    callbackRef.current = callback;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback, ...deps]);

  const debouncedCallback = useCallback(
    (...args: Args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * Debounced state hook - combines useState with debouncing
 * Perfect for form inputs with immediate UI updates but debounced side effects
 */
export function useDebouncedState<T>(
  initialValue: T,
  delay: number
): [T, T, (value: T | ((prev: T) => T)) => void] {
  const [immediateValue, setImmediateValue] = useState(initialValue);
  const debouncedValue = useDebounce(immediateValue, delay);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setImmediateValue(value);
  }, []);

  return [immediateValue, debouncedValue, setValue];
}

/**
 * Throttle hook for rate limiting
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();

    if (now >= lastUpdated.current + interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottledValue(value);
      }, interval - (now - lastUpdated.current));

      return () => clearTimeout(timer);
    }
  }, [value, interval]);

  return throttledValue;
}

/**
 * Throttled callback hook
 */
export function useThrottledCallback<Args extends any[]>(
  callback: (...args: Args) => void,
  interval: number,
  deps: React.DependencyList = []
) {
  const lastCalled = useRef<number>(0);
  const callbackRef = useRef(callback);

  // Update callback ref when dependencies change
  useEffect(() => {
    callbackRef.current = callback;``
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback, ...deps]);

  const throttledCallback = useCallback(
    (...args: Args) => {
      const now = Date.now();
      
      if (now >= lastCalled.current + interval) {
        lastCalled.current = now;
        callbackRef.current(...args);
      }
    },
    [interval]
  );

  return throttledCallback;
}

/**
 * Smart debounce that adapts to typing speed
 */
export function useSmartDebounce<T>(
  value: T,
  baseDelay: number = 300,
  options: {
    minDelay?: number;
    maxDelay?: number;
  } = {}
): T {
  const { minDelay = 100, maxDelay = 1000 } = options;
  const [debouncedValue, setDebouncedValue] = useState(value);
  const lastChangeRef = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastChange = now - lastChangeRef.current;
    
    // Adapt delay based on change frequency
    let adaptedDelay = baseDelay;
    if (timeSinceLastChange < 200) {
      // Fast typing - use shorter delay
      adaptedDelay = Math.max(minDelay, baseDelay * 0.5);
    } else if (timeSinceLastChange > 2000) {
      // Slow typing - use longer delay  
      adaptedDelay = Math.min(maxDelay, baseDelay * 1.5);
    }

    lastChangeRef.current = now;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, adaptedDelay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, baseDelay, minDelay, maxDelay]);

  return debouncedValue;
}