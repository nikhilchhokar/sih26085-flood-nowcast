"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal SWR-style cache: keyed promises shared across components, stale data kept while revalidating. */
const store = new Map<string, { data?: unknown; error?: Error; promise?: Promise<unknown>; at: number }>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

export function prefetch<T>(key: string, fetcher: () => Promise<T>) {
  const e = store.get(key);
  if (e?.data || e?.promise) return;
  load(key, fetcher);
}

function load<T>(key: string, fetcher: () => Promise<T>) {
  const entry = store.get(key) ?? { at: 0 };
  const p = fetcher()
    .then((data) => {
      store.set(key, { data, at: Date.now() });
      notify(key);
      return data;
    })
    .catch((error: Error) => {
      store.set(key, { ...entry, error, promise: undefined, at: Date.now() });
      notify(key);
    });
  store.set(key, { ...entry, promise: p, error: undefined });
  notify(key);
  return p;
}

export interface ApiState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

export function useApi<T>(key: string | null, fetcher: () => Promise<T>, opts: { refreshMs?: number; keepPrevious?: boolean } = {}): ApiState<T> {
  const [, force] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const prevData = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (!key) return;
    const fn = () => force((x) => x + 1);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(fn);
    const e = store.get(key);
    if (!e || (!e.data && !e.promise && !e.error)) load(key, () => fetcherRef.current());
    return () => {
      listeners.get(key)?.delete(fn);
    };
  }, [key]);

  useEffect(() => {
    if (!key || !opts.refreshMs) return;
    const id = setInterval(() => load(key, () => fetcherRef.current()), opts.refreshMs);
    return () => clearInterval(id);
  }, [key, opts.refreshMs]);

  const reload = useCallback(() => {
    if (key) load(key, () => fetcherRef.current());
  }, [key]);

  const e = key ? store.get(key) : undefined;
  const data = (e?.data as T | undefined) ?? (opts.keepPrevious ? prevData.current : undefined);
  if (e?.data) prevData.current = e.data as T;
  return { data, error: e?.error, loading: !!e?.promise && !e?.data, reload };
}
