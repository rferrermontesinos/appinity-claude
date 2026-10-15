import { SourceError } from '@appinity/shared';
import { z } from 'zod';

/**
 * Envío con el servicio push de Expo (docs.expo.dev/push-notifications/sending-notifications, consultado el
 * 2026-10-15): POST https://exp.host/--/api/v2/push/send con hasta 100 mensajes; devuelve un ticket por mensaje
 * («ok» con id = Expo lo recibió, no que llegara). `DeviceNotRegistered`: dejar de enviar a ese token. Ante 429 o 5xx,
 * reintento con espera exponencial. El token de acceso solo es obligatorio si se activa la seguridad reforzada en EAS.
 */
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPTS_BATCH = 1000;
const receiptsSchema = z.object({
  data: z.record(
    z.string(),
    z.object({ status: z.enum(['ok', 'error']), message: z.string().optional(), details: z.object({ error: z.string().optional() }).passthrough().optional() }),
  ),
});
export type ExpoReceipt = { status: 'ok' } | { status: 'error'; message: string; error?: string };
const BATCH = 100;
const ATTEMPTS = 4;

const ticketSchema = z.union([
  z.object({ status: z.literal('ok'), id: z.string() }),
  z.object({ status: z.literal('error'), message: z.string().default(''), details: z.object({ error: z.string().optional() }).passthrough().optional() }),
]);
const responseSchema = z.object({ data: z.array(ticketSchema) });

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; error?: string };

export interface ExpoPushSenderOptions {
  accessToken?: string;
  endpoint?: string;
  receiptsEndpoint?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class ExpoPushSender {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ExpoPushSenderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async send(messages: ExpoPushMessage[]): Promise<ExpoTicket[]> {
    const tickets: ExpoTicket[] = [];
    for (let start = 0; start < messages.length; start += BATCH) {
      const batch = messages.slice(start, start + BATCH).map((m) => ({ ...m, sound: 'default', channelId: 'default' }));
      tickets.push(...(await this.post(batch)));
    }
    return tickets;
  }

  /**
   * Recibos: si FCM/APNs aceptaron cada notificación (Expo recomienda consultarlos ~15 min después; duran 24 h).
   * Los ids sin recibo todavía no aparecen en la respuesta.
   */
  async receipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
    const out: Record<string, ExpoReceipt> = {};
    for (let start = 0; start < ids.length; start += RECEIPTS_BATCH) {
      const response = await this.fetchImpl(this.options.receiptsEndpoint ?? EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.options.accessToken ? { Authorization: `Bearer ${this.options.accessToken}` } : {}),
        },
        body: JSON.stringify({ ids: ids.slice(start, start + RECEIPTS_BATCH) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429 || response.status >= 500) throw new SourceError('unavailable', `Expo push respondió HTTP ${response.status}`, true);
      if (!response.ok) throw new SourceError('bad_response', `Expo push respondió HTTP ${response.status}`, false);
      const parsed = receiptsSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new SourceError('bad_response', 'Respuesta inesperada de los recibos de Expo', false);
      for (const [id, r] of Object.entries(parsed.data.data)) {
        out[id] = r.status === 'ok' ? { status: 'ok' } : { status: 'error', message: r.message ?? '', ...(r.details?.error ? { error: r.details.error } : {}) };
      }
    }
    return out;
  }

  private async post(batch: unknown[]): Promise<ExpoTicket[]> {
    let problem = '';
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) await this.sleep(2_000 * 2 ** attempt);
      let response: Response;
      try {
        response = await this.fetchImpl(this.options.endpoint ?? EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(this.options.accessToken ? { Authorization: `Bearer ${this.options.accessToken}` } : {}),
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        problem = (error as Error).name === 'TimeoutError' ? 'sin respuesta' : 'error de red';
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        problem = `HTTP ${response.status}`;
        continue;
      }
      if (!response.ok) throw new SourceError('bad_response', `Expo push respondió HTTP ${response.status}`, false);
      const parsed = responseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new SourceError('bad_response', 'Respuesta inesperada de Expo push', false);
      return parsed.data.data.map((t) =>
        t.status === 'ok' ? { status: 'ok', id: t.id } : { status: 'error', message: t.message, ...(t.details?.error ? { error: t.details.error } : {}) },
      );
    }
    throw new SourceError('unavailable', `Expo push no responde (${problem}); se reintentará`, true);
  }
}
