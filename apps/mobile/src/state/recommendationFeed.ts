import type { Category, RecommendationDto, RecommendationsDto } from '@appinity/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useSession } from './session';

/**
 * Lista de recomendaciones de una categoría (Categories, §3): misma fuente que Home pero sin aplicar sus descartes, y
 * paginada sin fin mientras haya algo honesto que enseñar (se piden más al llegar al final).
 */
export function useRecommendationFeed(category: Category) {
  // Las consultas autenticadas esperan a recuperar la sesión guardada (al abrir esta pantalla directamente).
  const hasSession = useSession((s) => Boolean(s.session?.token));
  const [items, setItems] = useState<RecommendationDto[]>([]);
  const [meta, setMeta] = useState<Omit<RecommendationsDto, 'items'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const seen = useRef(new Set<string>());
  const fetching = useRef(false);

  const more = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      const page = await apiRequest<RecommendationsDto>('/v1/me/recommendations/query', {
        method: 'POST',
        body: { limit: 20, category, context: 'category', exclude: [...seen.current] },
      });
      const { items: received, ...rest } = page;
      const fresh = received.filter((r) => !seen.current.has(r.item.id));
      for (const r of fresh) seen.current.add(r.item.id);
      setMeta(rest);
      setItems((list) => [...list, ...fresh]);
      setDone(fresh.length === 0);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [category]);

  // Primera página (el componente se monta por categoría), en cuanto hay sesión.
  useEffect(() => {
    if (hasSession && !seen.current.size && !done) void more();
  }, [hasSession, more, done]);

  return { items, meta, loading, error, done, more };
}
