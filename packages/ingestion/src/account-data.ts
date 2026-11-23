import {
  authIdentities,
  authSessions,
  catalogItems,
  conversationMembers,
  conversations,
  entitlements,
  feedback,
  follows,
  friendships,
  homeDismissals,
  invitations,
  itemVotes,
  messageRequests,
  messages,
  notificationDeliveries,
  providerConsents,
  pushTokens,
  recommendationActions,
  recommendationImpressions,
  userBlocks,
  userConnections,
  userItemObservations,
  userItemProfiles,
  userProfiles,
  userReports,
  userSettings,
  users,
  type Database,
} from '@appinity/database';
import { and, asc, count, eq, inArray, ne, or, sql } from 'drizzle-orm';

/**
 * Derechos de acceso y portabilidad (RGPD arts. 15 y 20) para atender las peticiones por email de la página
 * /legal/eliminar-cuenta y de la política de privacidad (`pnpm account:export`). Reúne lo que APPINITY guarda de una
 * persona en JSON. Deja fuera, a propósito:
 * - secretos: credenciales de proveedores, huellas de tokens de sesión, tokens push y cursores de sincronización;
 * - lo que escriben o calculan otras personas: los mensajes recibidos (solo cuántos), quién te sigue (solo cuántas
 *   personas) y las afinidades, que incluyen a personas que no aparecen como almas gemelas (ajuste de privacidad).
 */
export const ACCOUNT_EXPORT_FORMAT = 'appinity-account-export-v1';

export interface AccountMatch {
  userId: string;
  handle: string;
  dataset: 'demo' | 'live';
  status: 'active' | 'suspended' | 'deleted';
  emails: string[];
}

/** Cuentas de una petición: por el email de su identidad (sin distinguir mayúsculas) o por handle. */
export async function findAccounts(db: Database, lookup: { email?: string; handle?: string }): Promise<AccountMatch[]> {
  const email = lookup.email?.trim().toLowerCase();
  const handle = lookup.handle?.trim().toLowerCase();
  if (!email && !handle) return [];
  const ids = new Set<string>();
  if (email) {
    const rows = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(sql`lower(${authIdentities.email}) = ${email}`);
    for (const row of rows) ids.add(row.userId);
  }
  if (handle) {
    const rows = await db.select({ userId: users.id }).from(users).where(eq(users.handle, handle));
    for (const row of rows) ids.add(row.userId);
  }
  if (!ids.size) return [];
  const accounts = await db
    .select({ userId: users.id, handle: users.handle, dataset: users.dataset, status: users.status })
    .from(users)
    .where(inArray(users.id, [...ids]))
    .orderBy(asc(users.handle));
  const identities = await db
    .select({ userId: authIdentities.userId, email: authIdentities.email })
    .from(authIdentities)
    .where(inArray(authIdentities.userId, [...ids]));
  return accounts.map((a) => ({
    ...a,
    emails: identities.filter((i) => i.userId === a.userId && i.email).map((i) => i.email!),
  }));
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

const VOTE_LABEL: Record<number, string> = { [-2]: 'No me gusta (voto antiguo)', [-1]: 'No me gusta', 1: 'Me gusta', 2: 'Me encanta' };

interface ItemRef {
  id: string;
  title: string;
  category: string;
  type: string;
}

interface PersonRef {
  handle: string;
  displayName: string | null;
}

async function itemRefs(db: Database, ids: Iterable<string>): Promise<Map<string, ItemRef>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: catalogItems.id, title: catalogItems.title, category: catalogItems.category, type: catalogItems.itemType })
    .from(catalogItems)
    .where(inArray(catalogItems.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

async function personRefs(db: Database, ids: Iterable<string>): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: users.id, handle: users.handle, displayName: userProfiles.displayName })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, { handle: r.handle, displayName: r.displayName }]));
}

/** Todo lo que APPINITY guarda de una persona (ver la cabecera del módulo para lo que se excluye). */
export async function exportAccountData(db: Database, userId: string, now = new Date()) {
  const [account] = await db.select().from(users).where(eq(users.id, userId));
  if (!account) throw new Error('Cuenta no encontrada');

  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const identities = await db.select().from(authIdentities).where(eq(authIdentities.userId, userId));
  const consents = await db.select().from(providerConsents).where(eq(providerConsents.userId, userId)).orderBy(asc(providerConsents.grantedAt));
  const connections = await db.select().from(userConnections).where(eq(userConnections.userId, userId)).orderBy(asc(userConnections.createdAt));
  const evidence = await db.select().from(userItemObservations).where(eq(userItemObservations.userId, userId)).orderBy(asc(userItemObservations.firstSyncedAt));
  const tastes = await db.select().from(userItemProfiles).where(eq(userItemProfiles.userId, userId));
  const votes = await db.select().from(itemVotes).where(eq(itemVotes.userId, userId)).orderBy(asc(itemVotes.createdAt));
  const dismissals = await db.select().from(homeDismissals).where(eq(homeDismissals.userId, userId));
  const actions = await db.select().from(recommendationActions).where(eq(recommendationActions.userId, userId)).orderBy(asc(recommendationActions.createdAt));
  const impressions = await db.select().from(recommendationImpressions).where(eq(recommendationImpressions.userId, userId));
  const friendRows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
  const following = await db.select().from(follows).where(eq(follows.followerUserId, userId));
  const [followers] = await db.select({ n: count() }).from(follows).where(eq(follows.followedUserId, userId));
  const blocked = await db.select().from(userBlocks).where(eq(userBlocks.blockerUserId, userId));
  const reports = await db.select().from(userReports).where(eq(userReports.reporterId, userId));
  const invites = await db.select().from(invitations).where(eq(invitations.inviterId, userId));
  const requests = await db
    .select()
    .from(messageRequests)
    .where(or(eq(messageRequests.senderId, userId), eq(messageRequests.recipientId, userId)))
    .orderBy(asc(messageRequests.createdAt));
  const conversationRows = await db
    .select({ conversation: conversations })
    .from(conversations)
    .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, conversations.id), eq(conversationMembers.userId, userId)))
    .orderBy(asc(conversations.matchedAt));
  const conversationIds = conversationRows.map((c) => c.conversation.id);
  const sent = conversationIds.length
    ? await db
        .select()
        .from(messages)
        .where(and(inArray(messages.conversationId, conversationIds), eq(messages.senderId, userId)))
        .orderBy(asc(messages.createdAt))
    : [];
  const received = conversationIds.length
    ? await db
        .select({ conversationId: messages.conversationId, n: count() })
        .from(messages)
        .where(and(inArray(messages.conversationId, conversationIds), ne(messages.senderId, userId)))
        .groupBy(messages.conversationId)
    : [];
  const devices = await db.select().from(pushTokens).where(eq(pushTokens.userId, userId));
  const deliveries = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.userId, userId))
    .orderBy(asc(notificationDeliveries.createdAt));
  const premium = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  const sessions = await db.select().from(authSessions).where(eq(authSessions.userId, userId)).orderBy(asc(authSessions.createdAt));
  const comments = await db.select().from(feedback).where(eq(feedback.userId, userId)).orderBy(asc(feedback.createdAt));

  const items = await itemRefs(db, [
    ...evidence.map((e) => e.catalogItemId),
    ...tastes.map((t) => t.catalogItemId),
    ...votes.map((v) => v.catalogItemId),
    ...dismissals.map((d) => d.catalogItemId),
    ...actions.map((a) => a.catalogItemId),
    ...impressions.map((i) => i.catalogItemId),
  ]);
  const item = (id: string) => items.get(id) ?? { id, title: '(obra eliminada del catálogo)', category: null, type: null };
  const people = await personRefs(db, [
    ...friendRows.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId)),
    ...following.map((f) => f.followedUserId),
    ...blocked.map((b) => b.blockedUserId),
    ...reports.map((r) => r.reportedId),
    ...requests.map((r) => (r.senderId === userId ? r.recipientId : r.senderId)),
    ...conversationRows.map(({ conversation: c }) => (c.userLow === userId ? c.userHigh : c.userLow)),
  ]);
  const person = (id: string) => people.get(id) ?? { handle: '(cuenta eliminada)', displayName: null };
  const connectionSource = new Map(connections.map((c) => [c.id, c.sourceKey]));
  const receivedBy = new Map(received.map((r) => [r.conversationId, r.n]));

  return {
    format: ACCOUNT_EXPORT_FORMAT,
    generatedAt: now.toISOString(),
    excluded: [
      'Secretos: credenciales de los proveedores, huellas de los tokens de sesión, tokens de notificaciones y cursores de sincronización.',
      'Mensajes recibidos: solo cuántos hay en cada conversación (los escribió otra persona).',
      'Quién te sigue: solo cuántas personas (su lista es de ellas).',
      'Afinidades calculadas: incluyen a personas que han elegido no aparecer como almas gemelas.',
    ],
    account: {
      id: account.id,
      handle: account.handle,
      status: account.status,
      createdAt: iso(account.createdAt),
      adultConfirmedAt: iso(account.adultConfirmedAt),
      termsAcceptedAt: iso(account.termsAcceptedAt),
    },
    identities: identities.map((i) => ({
      provider: i.provider,
      subject: i.subject,
      email: i.email,
      createdAt: iso(i.createdAt),
      lastLoginAt: iso(i.lastLoginAt),
    })),
    profile: profile ? { displayName: profile.displayName, countryCode: profile.countryCode, avatarUrl: profile.avatarUrl } : null,
    settings: settings
      ? {
          locale: settings.locale,
          timeZone: settings.timeZone,
          radiusKm: settings.radiusKm,
          location:
            settings.locationLatitude === null
              ? null
              : {
                  label: settings.locationLabel,
                  latitude: settings.locationLatitude,
                  longitude: settings.locationLongitude,
                  source: settings.locationSource,
                  updatedAt: iso(settings.locationUpdatedAt),
                },
          discoverableByContacts: settings.discoverableByContacts,
          discoverableAsSoulmate: settings.discoverableAsSoulmate,
          shareCommonTastes: settings.shareCommonTastes,
          publicCreator: settings.publicCreator,
          notificationFrequency: settings.notificationFrequency,
        }
      : null,
    consents: consents.map((c) => ({
      source: c.sourceKey,
      scopes: c.scopes,
      consentVersion: c.consentVersion,
      grantedAt: iso(c.grantedAt),
      revokedAt: iso(c.revokedAt),
    })),
    connections: connections.map((c) => ({
      source: c.sourceKey,
      status: c.status,
      externalAccount: c.externalAccountRef,
      createdAt: iso(c.createdAt),
      lastSyncAt: iso(c.lastSyncAt),
      lastSyncStatus: c.lastSyncStatus,
      revokedAt: iso(c.revokedAt),
    })),
    tastes: tastes
      .map((t) => ({
        item: item(t.catalogItemId),
        known: t.knownConfidence,
        consumed: t.consumedConfidence,
        preference: t.preferenceScore,
        preferenceConfidence: t.preferenceConfidence,
        preferenceBasis: t.preferenceBasis,
        evidenceCount: t.evidenceCount,
        sourceCount: t.sourceCount,
        firstSeenAt: iso(t.firstSeenAt),
        lastSeenAt: iso(t.lastSeenAt),
      }))
      .sort((a, b) => a.item.title.localeCompare(b.item.title)),
    evidence: evidence.map((e) => ({
      item: item(e.catalogItemId),
      source: connectionSource.get(e.connectionId) ?? e.sourceKey,
      kind: e.observationKind,
      known: e.knownConfidence,
      consumed: e.consumedConfidence,
      preference: e.preferenceScore,
      preferenceConfidence: e.preferenceConfidence,
      preferenceBasis: e.preferenceBasis,
      engagement: e.engagement,
      occurredAt: iso(e.occurredAt),
      firstSyncedAt: iso(e.firstSyncedAt),
      details: e.metadata,
    })),
    votes: votes.map((v) => ({
      item: item(v.catalogItemId),
      // Sin valor: «No lo conozco» de versiones antiguas (no cambiaba gustos).
      vote: v.value === null ? 'No lo conozco (antiguo)' : (VOTE_LABEL[v.value] ?? String(v.value)),
      createdAt: iso(v.createdAt),
    })),
    recommendations: {
      dismissed: dismissals.map((d) => ({ item: item(d.catalogItemId), at: iso(d.createdAt) })),
      actions: actions.map((a) => ({ item: item(a.catalogItemId), action: a.action, at: iso(a.createdAt), undoneAt: iso(a.undoneAt) })),
      shown: impressions.map((i) => ({ item: item(i.catalogItemId), times: i.timesShown, firstAt: iso(i.firstShownAt), lastAt: iso(i.lastShownAt) })),
    },
    social: {
      friendships: friendRows.map((f) => ({
        with: person(f.requesterId === userId ? f.addresseeId : f.requesterId),
        requestedByYou: f.requesterId === userId,
        status: f.status,
        createdAt: iso(f.createdAt),
        respondedAt: iso(f.respondedAt),
      })),
      following: following.map((f) => ({ person: person(f.followedUserId), since: iso(f.createdAt) })),
      followers: followers?.n ?? 0,
      blocked: blocked.map((b) => ({ person: person(b.blockedUserId), at: iso(b.createdAt) })),
      reportsMade: reports.map((r) => ({ person: person(r.reportedId), reason: r.reason, note: r.note, at: iso(r.createdAt) })),
      invitations: invites.map((i) => ({
        code: i.code,
        maxUses: i.maxUses,
        uses: i.uses,
        createdAt: iso(i.createdAt),
        expiresAt: iso(i.expiresAt),
        revokedAt: iso(i.revokedAt),
      })),
    },
    chat: {
      requests: requests.map((r) => ({
        direction: r.senderId === userId ? 'enviada' : 'recibida',
        with: person(r.senderId === userId ? r.recipientId : r.senderId),
        kind: r.kind,
        status: r.status,
        // El primer mensaje solo si lo escribiste tú.
        firstMessage: r.senderId === userId ? r.firstMessage : null,
        createdAt: iso(r.createdAt),
        respondedAt: iso(r.respondedAt),
      })),
      conversations: conversationRows.map(({ conversation: c }) => ({
        with: person(c.userLow === userId ? c.userHigh : c.userLow),
        origin: c.origin,
        status: c.status,
        startedAt: iso(c.matchedAt),
        closedAt: iso(c.closedAt),
        messagesSent: sent.filter((m) => m.conversationId === c.id).map((m) => ({ body: m.body, at: iso(m.createdAt) })),
        messagesReceived: receivedBy.get(c.id) ?? 0,
      })),
    },
    notifications: {
      devices: devices.map((d) => ({ platform: d.platform, createdAt: iso(d.createdAt), lastSeenAt: iso(d.lastSeenAt), disabledAt: iso(d.disabledAt) })),
      deliveries: deliveries.map((d) => ({
        kind: d.kind,
        status: d.status,
        recommendations: d.recommendations,
        unreadChats: d.unreadChats,
        at: iso(d.createdAt),
      })),
    },
    premium: premium.map((p) => ({
      entitlement: p.entitlementId,
      environment: p.environment,
      active: p.active,
      productId: p.productId,
      expiresAt: iso(p.expiresAt),
      updatedAt: iso(p.updatedAt),
    })),
    sessions: sessions.map((s) => ({ createdAt: iso(s.createdAt), lastUsedAt: iso(s.lastUsedAt), expiresAt: iso(s.expiresAt), revokedAt: iso(s.revokedAt) })),
    feedback: comments.map((f) => ({ message: f.message, appVersion: f.appVersion, platform: f.platform, at: iso(f.createdAt), readAt: iso(f.readAt) })),
  };
}

export type AccountExport = Awaited<ReturnType<typeof exportAccountData>>;
