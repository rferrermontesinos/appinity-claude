import type { HomeUndoResultDto, RecommendationDto, RecommendationsDto, VoteValueDto } from '@appinity/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest } from '../api/client';

/**
 * Mazo de Home de la sesión (§2, motor de votos 2026-10-27):
 * - La cola se pide al recomendador excluyendo todo lo ya visto en la sesión (sin tarjetas repetidas).
 * - La impresión se registra cuando una tarjeta pasa a ser la primera (se ve de verdad), no al precargarla.
 * - Votar (No me gusta, Me gusta, Me encanta) cuenta para tus gustos y tus almas gemelas, con el mismo peso que una nota
 *   externa. «No lo conozco» no cambia gustos: la obra no vuelve a Inicio hasta 30 días después y sigue en
 *   Recomendaciones (motor v3, 2026-10-27).
 * - Votar es definitivo para esa obra; solo «Deshacer» revierte la última acción.
 */
const BATCH = 10;
const REFILL_BELOW = 3;

export type DeckAction = { kind: 'vote'; value: VoteValueDto } | { kind: 'unknown' };
export interface DeckEntry {
  item: RecommendationDto;
  action: DeckAction;
}

export interface HomeDeck {
  current: RecommendationDto | undefined;
  next: RecommendationDto | undefined;
  loading: boolean;
  error: unknown;
  /** Lo último que dijo el recomendador (estado de Trending, filtro de lugares…), para explicar un mazo vacío. */
  meta: Omit<RecommendationsDto, 'items'> | null;
  exhausted: boolean;
  /** Última acción de la sesión (se muestra con su «Deshacer» hasta la siguiente). */
  last: DeckEntry | null;
  canUndo: boolean;
  busy: boolean;
  apply: (action: DeckAction) => Promise<void>;
  undo: () => Promise<void>;
  reload: () => void;
}

export function useHomeDeck(enabled: boolean): HomeDeck {
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<RecommendationDto[]>([]);
  const [history, setHistory] = useState<DeckEntry[]>([]);
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

  /** Un voto cambia el perfil: lo que muestra «Tus gustos» y el mosaico de categorías se vuelve a pedir. */
  const refreshTastes = useCallback(() => {
    for (const queryKey of [['profiles'], ['profile'], ['categoryRanking']]) void queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);

  const act = useCallback(
    async (action: DeckAction) => {
      const top = queue[0];
      if (!top || busy) return;
      setBusy(true);
      // Optimista: la tarjeta desaparece al instante; si la API falla, vuelve.
      setQueue((q) => q.slice(1));
      try {
        if (action.kind === 'vote') {
          await apiRequest('/v1/me/home/votes', { method: 'POST', body: { itemId: top.item.id, value: action.value } });
          refreshTastes();
        } else {
          await apiRequest('/v1/me/home/actions', { method: 'POST', body: { itemId: top.item.id, action: 'dismiss' } });
        }
        setHistory((h) => [...h, { item: top, action }]);
      } catch (e) {
        // 409: ya estaba votada (otra sesión u otro dispositivo); no vuelve al mazo.
        if (!(e instanceof ApiError && e.status === 409)) {
          setQueue((q) => [top, ...q]);
          setError(e);
        }
      } finally {
        setBusy(false);
      }
    },
    [queue, busy, refreshTastes],
  );

  const undo = useCallback(async () => {
    if (!history.length || busy) return;
    setBusy(true);
    try {
      const result = await apiRequest<HomeUndoResultDto>('/v1/me/home/undo', { method: 'POST' });
      const index = history.map((e) => e.item.item.id).lastIndexOf(result.itemId);
      const restored = index >= 0 ? history[index] : undefined;
      if (index >= 0) setHistory((h) => [...h.slice(0, index), ...h.slice(index + 1)]);
      if (restored) setQueue((q) => [restored.item, ...q.filter((r) => r.item.id !== result.itemId)]);
      if (restored?.action.kind === 'vote') refreshTastes();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [history, busy, refreshTastes]);

  return {
    current,
    next: queue[1],
    loading: loading && !queue.length,
    error,
    meta,
    exhausted: exhausted && !queue.length,
    last: history[history.length - 1] ?? null,
    canUndo: history.length > 0 && !busy,
    busy,
    apply: act,
    undo,
    reload,
  };
}
