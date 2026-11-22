import type { HomeUndoResultDto, RecommendationDto, RecommendationsDto } from '@appinity/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';

/**
 * Mazo de Home de la sesión (§2):
 * - La cola se pide al recomendador excluyendo todo lo ya visto en la sesión (sin tarjetas repetidas).
 * - La impresión se registra cuando una tarjeta pasa a ser la primera (se ve de verdad), no al precargarla.
 * - Descartar y conservar se envían a la API; deshacer revierte la última acción y devuelve la tarjeta arriba.
 * Nada de esto cambia gustos ni afinidades.
 */
const BATCH = 10;
const REFILL_BELOW = 3;

export interface HomeDeck {
  current: RecommendationDto | undefined;
  next: RecommendationDto | undefined;
  loading: boolean;
  error: unknown;
  /** Lo último que dijo el recomendador (estado de Trending, filtro de lugares…), para explicar un mazo vacío. */
  meta: Omit<RecommendationsDto, 'items'> | null;
  exhausted: boolean;
  canUndo: boolean;
  busy: boolean;
  dismiss: () => Promise<void>;
  keep: () => Promise<void>;
  undo: () => Promise<void>;
  reload: () => void;
}

export function useHomeDeck(enabled: boolean): HomeDeck {
  const [queue, setQueue] = useState<RecommendationDto[]>([]);
  const [history, setHistory] = useState<RecommendationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [meta, setMeta] = useState<HomeDeck['meta']>(null);
  const [exhausted, setExhausted] = useState(false);
  const seen = useRef(new Set<string>());
  const impressed = useRef(new Set<string>());
  const fetching = useRef(false);

  const fetchMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      // La cola de la sesión va en el cuerpo: el mazo no tiene fin y no cabría en una URL.
      const page = await apiRequest<RecommendationsDto>('/v1/me/recommendations/query', {
        method: 'POST',
        body: { limit: BATCH, context: 'home', exclude: [...seen.current] },
      });
      const { items, ...rest } = page;
      setMeta(rest);
      const fresh = items.filter((r) => !seen.current.has(r.item.id));
      for (const r of fresh) seen.current.add(r.item.id);
      setQueue((q) => [...q, ...fresh]);
      setExhausted(fresh.length === 0);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => {
    seen.current = new Set();
    impressed.current = new Set();
    setQueue([]);
    setHistory([]);
    setExhausted(false);
    void fetchMore();
  }, [fetchMore]);

  // Rellena la cola antes de que se acabe (también la primera carga, al tener sesión).
  useEffect(() => {
    if (enabled && !exhausted && queue.length < REFILL_BELOW) void fetchMore();
  }, [enabled, exhausted, queue.length, fetchMore]);

  // Impresión efectiva: la tarjeta de arriba es la que se ve.
  const current = queue[0];
  useEffect(() => {
    if (!current || impressed.current.has(current.item.id)) return;
    impressed.current.add(current.item.id);
    void apiRequest('/v1/me/home/impressions', { method: 'POST', body: { itemId: current.item.id } }).catch(() => undefined);
  }, [current]);

  const act = useCallback(
    async (action: 'dismiss' | 'keep') => {
      const top = queue[0];
      if (!top || busy) return;
      setBusy(true);
      // Optimista: la tarjeta desaparece al instante; si la API falla, vuelve.
      setQueue((q) => q.slice(1));
      try {
        await apiRequest('/v1/me/home/actions', { method: 'POST', body: { itemId: top.item.id, action } });
        setHistory((h) => [...h, top]);
      } catch (e) {
        setQueue((q) => [top, ...q]);
        setError(e);
      } finally {
        setBusy(false);
      }
    },
    [queue, busy],
  );

  const undo = useCallback(async () => {
    if (!history.length || busy) return;
    setBusy(true);
    try {
      const result = await apiRequest<HomeUndoResultDto>('/v1/me/home/undo', { method: 'POST' });
      const restored = [...history].reverse().find((r) => r.item.id === result.itemId);
      setHistory((h) => {
        const index = h.map((r) => r.item.id).lastIndexOf(result.itemId);
        return index >= 0 ? [...h.slice(0, index), ...h.slice(index + 1)] : h;
      });
      if (restored) setQueue((q) => [restored, ...q.filter((r) => r.item.id !== restored.item.id)]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [history, busy]);

  return {
    current,
    next: queue[1],
    loading: loading && !queue.length,
    error,
    meta,
    exhausted: exhausted && !queue.length,
    canUndo: history.length > 0 && !busy,
    busy,
    dismiss: () => act('dismiss'),
    keep: () => act('keep'),
    undo,
    reload,
  };
}
