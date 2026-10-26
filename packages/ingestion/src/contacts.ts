import { authIdentities, userAffinities, userProfiles, userSettings, users, type Database } from '@appinity/database';
import { CONTACT_HASH_BATCH_MAX, type ContactMatchDto } from '@appinity/shared';
import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { friendshipState } from './social.js';
import { notBlocked } from './soulmates.js';

const HASH = /^[0-9a-f]{64}$/;

/**
 * Amigos desde los contactos del dispositivo (§4, decisiones 2026-10-26).
 *
 * El móvil envía el SHA-256 de cada email normalizado (minúsculas, sin espacios); nunca la agenda en claro. El servidor
 * lo compara con los emails **verificados** de las identidades de inicio de sesión de quien tiene activado «Permitir
 * que mis contactos me encuentren», y **no guarda** lo recibido. Un hash no anonimiza (quien conozca el email puede
 * calcularlo): por eso solo se responde con personas que lo permiten y la ruta tiene un límite de peticiones bajo.
 */
export async function matchContacts(db: Database, viewerId: string, hashes: string[]): Promise<ContactMatchDto[]> {
  // El controlador ya valida formato y tamaño (zod); esto es solo una defensa si se llama desde otro sitio.
  const unique = [...new Set(hashes.map((h) => h.toLowerCase()))].filter((h) => HASH.test(h));
  if (unique.length > CONTACT_HASH_BATCH_MAX) throw new RangeError(`Como máximo ${CONTACT_HASH_BATCH_MAX} contactos por petición`);
  if (!unique.length) return [];
  const [viewer] = await db.select({ dataset: users.dataset }).from(users).where(eq(users.id, viewerId));
  if (!viewer) return [];

  const emailHash = sql<string>`encode(sha256(convert_to(lower(${authIdentities.email}), 'UTF8')), 'hex')`;
  const rows = await db
    .selectDistinct({ userId: users.id })
    .from(authIdentities)
    .innerJoin(users, eq(users.id, authIdentities.userId))
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(
      and(
        isNotNull(authIdentities.email),
        inArray(emailHash, unique),
        ne(users.id, viewerId),
        eq(users.dataset, viewer.dataset),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        isNotNull(users.adultConfirmedAt),
        eq(userSettings.discoverableByContacts, true),
        notBlocked(viewerId, users.id),
      ),
    );
  const ids = rows.map((r) => r.userId);
  if (!ids.length) return [];

  const profiles = await db.select().from(userProfiles).where(inArray(userProfiles.userId, ids));
  const affinities = await db
    .select({ target: userAffinities.targetUserId, score: userAffinities.score })
    .from(userAffinities)
    .where(and(eq(userAffinities.sourceUserId, viewerId), inArray(userAffinities.targetUserId, ids)));
  const profileOf = new Map(profiles.map((p) => [p.userId, p]));
  const affinityOf = new Map(affinities.map((a) => [a.target, a.score]));
  const result: ContactMatchDto[] = [];
  for (const id of ids) {
    const p = profileOf.get(id);
    result.push({
      userId: id,
      displayName: p?.displayName ?? '—',
      countryCode: p?.countryCode ?? null,
      avatarUrl: p?.avatarUrl ?? null,
      affinity: affinityOf.get(id) ?? null,
      friendship: (await friendshipState(db, viewerId, id)).state,
    });
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
