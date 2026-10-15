import type { ApiErrorDto, AuthSessionDto, HealthDto } from '@appinity/shared';
import { API } from '../config';
import { useSession } from '../state/session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Error de red: el teléfono no alcanza la API (IP, red o firewall). */
export class NetworkError extends Error {}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

let refreshing: Promise<boolean> | null = null;

/** Renueva la sesión de producción (una sola petición aunque varias llamadas la necesiten a la vez). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const current = useSession.getState().session;
    if (!current?.refreshToken) return false;
    try {
      const response = await fetch(`${API.url}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) {
        if (response.status === 401) await useSession.getState().clear();
        return false;
      }
      const next = (await response.json()) as AuthSessionDto;
      await useSession.getState().setSession({ ...current, token: next.accessToken, expiresAt: next.expiresAt, refreshToken: next.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 10_000 } = options;
  // Access token de producción a punto de caducar: se renueva antes de llamar.
  const stored = auth ? useSession.getState().session : null;
  if (stored?.refreshToken && new Date(stored.expiresAt).getTime() < Date.now() + 30_000) await refreshSession();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? useSession.getState().session?.token : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API.url}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new NetworkError(`No se alcanza ${API.url}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    // Solo se cierra la sesión si se envió un token y la API lo rechaza (caducado o revocado).
    if (response.status === 401 && token) {
      // Sesión de producción: se intenta renovar una vez y repetir la llamada.
      if (!retried && useSession.getState().session?.refreshToken && (await refreshSession())) return apiRequest<T>(path, options, true);
      void useSession.getState().clear();
    }
    const err = json as Partial<ApiErrorDto> | undefined;
    const message = Array.isArray(err?.message) ? err.message.join(', ') : (err?.message ?? response.statusText);
    throw new ApiError(response.status, message, err?.details);
  }
  return json as T;
}

/** /health responde 503 cuando hay servicios caídos, pero su cuerpo sigue describiendo el estado. */
export async function fetchHealth(): Promise<HealthDto> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${API.url}/health`, { signal: controller.signal });
    if (response.status !== 200 && response.status !== 503) {
      throw new ApiError(response.status, response.statusText);
    }
    return (await response.json()) as HealthDto;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new NetworkError(`No se alcanza ${API.url}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
