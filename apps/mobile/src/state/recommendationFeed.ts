import type { CatalogExpansionDto, Category, RecommendationDto, RecommendationsDto } from '@appinity/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useSession } from './session';

/** Tarjetas por «Cargar más» (2026-10-27). */
export const FEED_PAGE = 10;
/** Mientras el worker amplía el catálogo: reintentos y espera entre ellos. */
const EXPAND_POLLS = 8;
const EXPAND_WAIT_MS = 4_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lista de recomendaciones de una categoría (Categories, §3): misma fuente que Home pero sin aplicar sus descartes. Se
 * pide de 10 en 10 con «Cargar más». Si se acaba lo que hay, se pide ampliar el catálogo (obras populares de Wikidata,
 * que llegan como «para explorar») y se vuelve a mirar unas cuantas veces: así la lista tiende a no acabarse.
 */
export function useRecommendationFeed(category: Category) {
  // Las consultas autenticadas esperan a recuperar la sesión guardada (al abrir esta pantalla directamente).
  const hasSession = useSession((s) => Boolean(s.session?.token));
  const [items, setItems] = useState<RecommendationDto[]>([]);
  const [meta, setMeta] = useState<Omit<RecommendationsDto, 'items'> | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** No hay más: ni en el catálogo ni ampliándolo (por ahora). */
  const [done, setDone] = useState(false);
  /** Se pidió ampliar, pero las obras nuevas aún no han llegado: se puede volver a intentar. */
  const [pending, setPending] = useState(false);
  const seen = useRef(new Set<string>());
  const fetching = useRef(false);
  const started = useRef(false);

  const page = useCallback(async () => {
    const result = await apiRequest<RecommendationsDto>('/v1/me/recommendations/query', {
      method: 'POST',
      body: { limit: FEED_PAGE, category, context: 'category', exclude: [...seen.current] },
    });
    const { items: received, ...rest } = result;
    const fresh = received.filter((r) => !seen.current.has(r.item.id));
    for (const r of fresh) seen.current.add(r.item.id);
    setMeta(rest);
    if (fresh.length) setItems((list) => [...list, ...fresh]);
    return fresh.length;
  }, [category]);

  const more = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      setError(null);
      setPending(false);
      if (await page()) return;
      // Se acabó lo que hay: ampliar el catálogo y esperar a que el worker traiga obras nuevas.
      const expansion = await apiRequest<CatalogExpansionDto>('/v1/me/recommendations/expand', { method: 'POST', body: { category } });
      if (expansion.status !== 'queued') {
        setDone(true);
        return;
      }
      setExpanding(true);
      for (let attempt = 0; attempt < EXPAND_POLLS; attempt++) {
        await wait(EXPAND_WAIT_MS);
        if (await page()) return;
      }
      setPending(true);
    } catch (e) {
      setError(e);
    } finally {
      setExpanding(false);
      fetching.current = false;
      setLoading(false);
    }
  }, [category, page]);

  // Primera página (el componente se monta por categoría), en cuanto hay sesión.
  useEffect(() => {
    if (hasSession && !started.current) {
      started.current = true;
      void more();
    }
  }, [hasSession, more]);

  return { items, meta, loading, expanding, error, done, pending, more };
}
