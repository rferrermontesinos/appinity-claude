import type { INestApplication } from '@nestjs/common';
import { createDatabase, feedback, type DatabaseHandle } from '@appinity/database';
import { createOrResetLocalUser } from '@appinity/ingestion';
import { FEEDBACK_MAX_LENGTH, FEEDBACK_PER_DAY } from '@appinity/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEnv, truncateAll } from '../../../test/helpers.js';
import { createApp } from '../dist/bootstrap.js';
import { loadEnv } from '../dist/config/env.js';

/** «Enviar comentario» (fase B5) por HTTP. Persona SINTÉTICA: cuenta local «test_feedback_api». */
let db: DatabaseHandle;
let app: INestApplication;
let base: string;
let token: string;
let userId: string;

const COMMENT = { message: 'Al votar una película, la tarjeta se queda en blanco.', appVersion: '0.1.0', platform: 'android' };

beforeAll(async () => {
  const env = testEnv();
  db = createDatabase(env.DATABASE_URL!, { max: 2 });
  await truncateAll(db.db);
  const local = await createOrResetLocalUser(db.db, { handle: 'test_feedback_api', displayName: 'Sintética' });
  userId = local.userId;
  app = await createApp(loadEnv(env), { logger: false });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const res = await fetch(`${base}/v1/dev/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: 'test_feedback_api', code: local.code }),
  });
  token = ((await res.json()) as { token: string }).token;
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

const post = (body: unknown, auth = true) =>
  fetch(`${base}/v1/me/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const stored = () => db.db.select().from(feedback).where(eq(feedback.userId, userId));

describe('POST /v1/me/feedback', () => {
  it('sin sesión responde 401 y no guarda nada', async () => {
    expect(token).toBeTruthy();
    expect((await post(COMMENT, false)).status).toBe(401);
    expect(await stored()).toEqual([]);
  });

  it('rechaza un texto vacío o demasiado largo, campos de más y versiones o plataformas raras', async () => {
    for (const body of [
      { ...COMMENT, message: '   ' },
      { ...COMMENT, message: 'x'.repeat(FEEDBACK_MAX_LENGTH + 1) },
      { ...COMMENT, screenshot: 'data:image/png;base64,AAAA' },
      { ...COMMENT, appVersion: 'latest' },
      { ...COMMENT, platform: 'windows' },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(await stored()).toEqual([]);
  });

  it('guarda el comentario de la persona con sesión (204)', async () => {
    const res = await post({ ...COMMENT, message: `  ${COMMENT.message}  ` });
    expect(res.status).toBe(204);
    expect(await stored()).toEqual([expect.objectContaining({ message: COMMENT.message, appVersion: '0.1.0', platform: 'android', readAt: null })]);
  });

  it(`con ${FEEDBACK_PER_DAY} en 24 horas responde 429 con un mensaje claro`, async () => {
    const already = (await stored()).length;
    await db.db
      .insert(feedback)
      .values(
        Array.from({ length: FEEDBACK_PER_DAY - already }, (_, i) => ({
          userId,
          message: `Comentario ${i}`,
          appVersion: '0.1.0',
          platform: 'android' as const,
        })),
      );
    const res = await post(COMMENT);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { message: string }).message).toMatch(/Has enviado 10 comentarios hoy/);
    expect(await stored()).toHaveLength(FEEDBACK_PER_DAY);
  });
});
