import { describe, expect, it } from 'vitest';
import { ExpoPushSender } from '../src/push/expo.js';

/** Servicio de Expo SIMULADO: no se envía nada real. */
describe('emisor de Expo push', () => {
  it('lotes de 100, reintento ante 429 y tickets ok/error con su código', async () => {
    const bodies: unknown[][] = [];
    let calls = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      if (calls === 1) return new Response('', { status: 429 });
      const batch = JSON.parse(String(init!.body)) as Array<{ to: string }>;
      bodies.push(batch);
      return new Response(
        JSON.stringify({
          data: batch.map((m, i) => (m.to.includes('baja') ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `t${i}` })),
        }),
      );
    }) as typeof fetch;
    const sender = new ExpoPushSender({ fetchImpl, sleep: async () => undefined, accessToken: 'token-de-test' });
    const messages = Array.from({ length: 150 }, (_, i) => ({ to: i === 3 ? 'ExponentPushToken[baja]' : `ExponentPushToken[d${i}]`, title: 't', body: 'b', data: {} }));
    const tickets = await sender.send(messages);
    expect(bodies.map((b) => b.length)).toEqual([100, 50]);
    expect(bodies[0]![0]).toMatchObject({ sound: 'default', channelId: 'default' });
    expect(tickets).toHaveLength(150);
    expect(tickets[3]).toEqual({ status: 'error', message: 'gone', error: 'DeviceNotRegistered' });
    expect(tickets[0]).toEqual({ status: 'ok', id: 't0' });
  });
});

describe('recibos de Expo push', () => {
  it('consulta por ids y devuelve ok o el error de FCM/APNs; los ids sin recibo no aparecen', async () => {
    let body: unknown;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ data: { a: { status: 'ok' }, b: { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } } }));
    }) as typeof fetch;
    const sender = new ExpoPushSender({ fetchImpl, sleep: async () => undefined });
    expect(await sender.receipts(['a', 'b', 'c'])).toEqual({ a: { status: 'ok' }, b: { status: 'error', message: 'gone', error: 'DeviceNotRegistered' } });
    expect(body).toEqual({ ids: ['a', 'b', 'c'] });
  });
});
