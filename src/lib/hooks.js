import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, describeError } from './api.js';

/**
 * Small data-loading hook with an explicit reload path. Errors are returned to
 * the screen so each module can phrase failures in its own operational voice.
 */
export function useLoader(loader, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(
    async ({ quiet = false } = {}) => {
      if (!enabled) return null;
      if (!quiet) setLoading(true);
      try {
        const result = await loaderRef.current();
        if (mounted.current) {
          setData(result);
          setError(null);
          setLoading(false);
        }
        return result;
      } catch (caught) {
        if (mounted.current) {
          setError(caught);
          setLoading(false);
        }
        return null;
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    reload();
    // The dependency list is supplied by the caller to describe query inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, error, loading, reload, setData };
}

export function useInterval(callback, delay) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (delay === null || delay === undefined) return undefined;
    const timer = setInterval(() => saved.current(), delay);
    return () => clearInterval(timer);
  }, [delay]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), intervalMs);
  return now;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ShowFlow` : 'ShowFlow';
    return () => {
      document.title = 'ShowFlow';
    };
  }, [title]);
}

export function useDelayedFlag(flag, delay = 220) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!flag) {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [flag, delay]);
  return visible;
}

export function friendlyError(error, fallback = 'This action could not be completed.') {
  if (!error) return fallback;
  if (error instanceof ApiError) return error.message;
  return describeError(error) || fallback;
}
