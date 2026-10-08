import type { INestApplication } from '@nestjs/common';
import { EntityResolver, WikidataSnapshotProvider } from '@appinity/catalog';
import { createDatabase, type DatabaseHandle } from '@appinity/database';
import { runConnectionSync, seedDemo } from '@appinity/ingestion';
import { createAdapterRegistry } from '@appinity/integrations';
import type {
  CatalogItemDto,
  ConnectionDto,
  ItemProfileDetailDto,
  ItemProfileDto,
  Page,
  SourceDto,
  SyncRunDto,
} from '@appinity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

let database: DatabaseHandle;
let app: INestApplication;
let base: string;
const tokens: Record<string, string> = {};

async function call<T>(path: string, handle: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[handle]}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
}

beforeAll(async () => {
  const env = testEnv();
  database = createDatabase(env.DATABASE_URL!);
  await truncateAll(database.db);
  await seedDemo(database);
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  for (const handle of ['demo_laura', 'demo_jordi', 'demo_sam']) {
    const res = await fetch(`${base}/v1/dev/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    tokens[handle] = ((await res.json()) as { token: string }).token;
  }
});

afterAll(async () => {
  await app?.close();
  await database?.close();
});

describe('catálogo', () => {
  it('exige sesión', async () => {
    expect((await fetch(`${base}/v1/catalog/items`)).status).toBe(401);
  });

  it('lista objetos principales con imagen o fallback de categoría, nunca sin imagen', async () => {
    const { status, body } = await call<Page<CatalogItemDto> & { total: number }>('/v1/catalog/items?category=games&limit=100', 'demo_laura');
    expect(status).toBe(200);
    expect(body.items.length).toBe(body.total);
    expect(body.items.every((i) => i.category === 'games' && i.parentItemId === null)).toBe(true);
    expect(body.items.every((i) => i.primaryImage.url.length > 0)).toBe(true);
    const stardew = body.items.find((i) => i.title === 'Stardew Valley')!;
    expect(stardew.primaryImage).toMatchObject({ isFallback: true, source: 'appinity_fallback' });
    expect(stardew.primaryImage.url).toMatch(/\/static\/fallback\/games\.svg$/);
    const withImage = body.items.find((i) => !i.primaryImage.isFallback)!;
    expect(withImage.primaryImage.attribution).toMatch(/Wikimedia Commons/);
    expect(withImage.primaryImage.license).toBeTruthy();
  });

  it('conserva la precisión real de las fechas', async () => {
    const { body } = await call<Page<CatalogItemDto>>('/v1/catalog/items?category=books&limit=100', 'demo_laura');
    const quixote = body.items.find((i) => i.title === 'Don Quijote de la Mancha')!;
    expect(quixote).toMatchObject({ releaseDate: '1605', releaseDatePrecision: 'year' });
  });

  it('valida los parámetros en runtime', async () => {
    expect((await call('/v1/catalog/items?category=sports', 'demo_laura')).status).toBe(400);
    expect((await call('/v1/catalog/items?limit=1000', 'demo_laura')).status).toBe(400);
    expect((await call('/v1/catalog/items/no-es-un-uuid', 'demo_laura')).status).toBe(400);
  });

  it('sirve el fallback SVG y protege las rutas de imágenes', async () => {
    const svg = await fetch(`${base}/static/fallback/podcasts.svg`);
    expect(svg.status).toBe(200);
    expect(svg.headers.get('content-type')).toMatch(/image\/svg\+xml/);
    expect((await fetch(`${base}/static/fallback/sports.svg`)).status).toBe(404);
    expect((await fetch(`${base}/media/catalog/..%2F..%2F.env`)).status).toBe(404);
    expect((await fetch(`${base}/media/otro/archivo.jpg`)).status).toBe(404);
  });
});

describe('fuentes y conexiones', () => {
  it('las fuentes simuladas son conectables para usuarios de demo; las reales previstas no', async () => {
    const { body } = await call<SourceDto[]>('/v1/sources', 'demo_sam');
    expect(body.filter((s) => s.connectable).every((s) => s.simulated)).toBe(true);
    // Sin STEAM_WEB_API_KEY en el entorno de test, Steam aparece sin configurar; Google está prevista (fases 3–4).
    expect(body.find((s) => s.key === 'steam')).toMatchObject({ connectable: false, availability: 'unconfigured' });
    expect(body.find((s) => s.key === 'google_portability')).toMatchObject({ connectable: false, availability: 'planned', plannedPhase: '3–4' });
    // Las fuentes que requieren acuerdo comercial no se anuncian (revisión de fuentes 2026-10-08).
    expect(body.map((s) => s.key)).not.toContain('tmdb');
    expect(body.map((s) => s.key)).not.toContain('lastfm');
  });

  it('conectar una fuente crea un sync en cola; procesarlo importa observaciones', async () => {
    const { status, body } = await call<{ connection: ConnectionDto; run: SyncRunDto }>('/v1/me/connections', 'demo_sam', {
      method: 'POST',
      body: JSON.stringify({ sourceKey: 'fixture_screen' }),
    });
    expect(status).toBe(201);
    expect(body.run.status).toBe('queued');
    expect(body.connection).toMatchObject({ sourceKey: 'fixture_screen', status: 'active', simulated: true });
    // Sam no tiene actividad simulada en esta fuente: el sync termina vacío, sin inventar evidencia.
    const provider = new WikidataSnapshotProvider();
    await runConnectionSync({ database, registry: createAdapterRegistry({ demoMode: true }), resolver: new EntityResolver(database.db, [provider]) }, body.run.id);
    const runs = await call<SyncRunDto[]>(`/v1/me/connections/${body.connection.id}/runs`, 'demo_sam');
    expect(runs.body[0]).toMatchObject({ status: 'succeeded', recordsReceived: 0, observationsInserted: 0 });
    const again = await call('/v1/me/connections', 'demo_sam', { method: 'POST', body: JSON.stringify({ sourceKey: 'fixture_screen' }) });
    expect(again.status).toBe(409);
    const unknown = await call('/v1/me/connections', 'demo_sam', { method: 'POST', body: JSON.stringify({ sourceKey: 'steam' }) });
    expect(unknown.status).toBe(422);
  });

  it('los recursos de otra persona responden 404', async () => {
    const lauras = await call<ConnectionDto[]>('/v1/me/connections', 'demo_laura');
    const target = lauras.body[0]!.id;
    expect((await call(`/v1/me/connections/${target}/runs`, 'demo_jordi')).status).toBe(404);
    expect((await call(`/v1/me/connections/${target}/sync`, 'demo_jordi', { method: 'POST', body: '{}' })).status).toBe(404);
    expect((await call(`/v1/me/connections/${target}?purge=true`, 'demo_jordi', { method: 'DELETE' })).status).toBe(404);
    expect((await call<ConnectionDto[]>('/v1/me/connections', 'demo_laura')).body.find((c) => c.id === target)!.status).toBe('active');
  });
});

describe('perfiles propios', () => {
  it('la lista separa Known, Consumed y Preference y usa NULL cuando falta evidencia', async () => {
    const { body } = await call<ItemProfileDto[]>('/v1/me/item-profiles?category=games', 'demo_laura');
    const mindustry = body.find((p) => p.item.title === 'Mindustry')!;
    expect(mindustry).toMatchObject({ knownConfidence: 1, consumedConfidence: 0, preferenceScore: null, preferenceBasis: null });
    expect(mindustry.sources).toEqual(['fixture_play']);
  });

  it('el detalle solo muestra las evidencias del propio usuario', async () => {
    const lauraList = await call<ItemProfileDto[]>('/v1/me/item-profiles?category=movies', 'demo_laura');
    const casablanca = lauraList.body.find((p) => p.item.title === 'Casablanca')!;
    const asLaura = await call<ItemProfileDetailDto>(`/v1/me/item-profiles/${casablanca.item.id}`, 'demo_laura');
    const asJordi = await call<ItemProfileDetailDto>(`/v1/me/item-profiles/${casablanca.item.id}`, 'demo_jordi');
    expect(asLaura.body.observations).toHaveLength(4);
    expect(asJordi.body.observations).toHaveLength(1);
    expect(asJordi.body.observations[0]!.sourceKey).toBe('fixture_screen');
    expect(asJordi.body.profile!.preferenceScore).toBeCloseTo((7 - 5.5) / 4.5, 4);
    // Sin evidencia propia, el perfil es null (no 0).
    const asSam = await call<ItemProfileDetailDto>(`/v1/me/item-profiles/${casablanca.item.id}`, 'demo_sam');
    expect(asSam.body.profile).toBeNull();
    expect(asSam.body.observations).toHaveLength(0);
  });

  it('desconectar con borrado vía API recalcula los perfiles', async () => {
    const connections = await call<ConnectionDto[]>('/v1/me/connections', 'demo_jordi');
    const screen = connections.body.find((c) => c.sourceKey === 'fixture_screen')!;
    const res = await call<{ purgedObservations: number }>(`/v1/me/connections/${screen.id}?purge=true`, 'demo_jordi', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.body.purgedObservations).toBe(3);
    const profiles = await call<ItemProfileDto[]>('/v1/me/item-profiles?category=movies', 'demo_jordi');
    expect(profiles.body).toHaveLength(0);
    const after = await call<ConnectionDto[]>('/v1/me/connections', 'demo_jordi');
    expect(after.body.find((c) => c.sourceKey === 'fixture_screen')).toMatchObject({ status: 'revoked', observationCount: 0 });
  });
});
