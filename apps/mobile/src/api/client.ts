import type { ApiErrorDto, HealthDto } from '@appinity/shared';
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 10_000 } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = useSession.getState().session?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

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
    if (response.status === 401 && auth) void useSession.getState().clear();
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
