import type { ConnectionDto, SyncRunDto } from '@appinity/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import { useConnect, useConnections, useDisconnect, useMe, useRuns, useSources, useSync, type SourceView } from '../api/queries';
import { radius, spacing, usePalette } from '../theme';
import { Badge, Body, Button, Card, ErrorCard, Loading, Small, Title } from './ui';

/** Botón oficial «Sign in through Steam» (Steam pide usar sus botones para enlazar a su inicio de sesión). */
const STEAM_SIGN_IN_BUTTON = 'https://community.fastly.steamstatic.com/public/images/signinthroughsteam/sits_01.png';

function sourceName(t: TFunction, key: string, fallback: string): string {
  const translated = t(`sources.names.${key}`, { defaultValue: '' });
  return translated || fallback;
}

function RunSummary({ run }: { run: SyncRunDto }) {
  const { t } = useTranslation();
  const c = usePalette();
  const color = run.status === 'failed' ? c.danger : run.status === 'partial' ? c.warn : run.status === 'succeeded' ? c.ok : c.textMuted;
  return (
    <View style={{ gap: 2 }}>
      <Small style={{ color, fontWeight: '700' }}>
        {t('sources.lastRun')}:{' '}
        {t('sources.runSummary', {
          status: t(`sources.runStatus.${run.status}`),
          inserted: run.observationsInserted,
          updated: run.observationsUpdated,
          unchanged: run.observationsUnchanged,
        })}
      </Small>
      {run.partialErrors.length ? (
        <Small style={{ color: c.warn }}>
          {t('sources.runErrors', { count: run.partialErrors.length, message: run.partialErrors[0]!.message.slice(0, 120) })}
        </Small>
      ) : null}
      {run.errorMessage ? <Small style={{ color: c.danger }}>{run.errorMessage}</Small> : null}
    </View>
  );
}

function ConnectionRow({
  source,
  connection,
  isDemoUser,
}: {
  source: SourceView;
  connection: ConnectionDto | undefined;
  isDemoUser: boolean;
}) {
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const queryClient = useQueryClient();
  const connect = useConnect();
  const sync = useSync();
  const disconnect = useDisconnect();
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const active = connection && connection.status !== 'revoked';
  const runs = useRuns(connection?.id);
  const latest = connection ? runs.data?.[0] : undefined;

  // Cuando el worker termina un sync, refresca conexiones, perfiles y catálogo.
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    const status = latest?.status;
    const wasPending = previous.current === 'queued' || previous.current === 'running';
    if (wasPending && status && status !== 'queued' && status !== 'running') {
      for (const key of ['connections', 'profiles', 'profile', 'catalog']) void queryClient.invalidateQueries({ queryKey: [key] });
    }
    previous.current = status;
  }, [latest?.status, queryClient]);

  /**
   * Conectar: las fuentes simuladas responden al momento; las reales (Steam) abren el inicio de sesión del
   * proveedor en un navegador de autenticación y vuelven a la app con el resultado.
   */
  async function startConnect() {
    setNotice(null);
    const returnUrl = Linking.createURL('profile');
    const result = await connect.mutateAsync({ sourceKey: source.key, returnUrl }).catch(() => null);
    if (result?.kind === 'redirect') {
      const auth = await WebBrowser.openAuthSessionAsync(result.authorizationUrl, returnUrl);
      if (auth.type === 'success') {
        const params = Linking.parse(auth.url).queryParams ?? {};
        if (params.result === 'connected') setNotice({ text: t('sources.connectedResult'), tone: 'ok' });
        else setNotice({ text: t('sources.errorResult', { message: String(params.message ?? '') }), tone: 'error' });
      } else {
        setNotice({ text: t('sources.cancelledResult'), tone: 'error' });
      }
    }
    for (const key of ['connections', 'profiles', 'profile', 'catalog']) await queryClient.invalidateQueries({ queryKey: [key] });
  }

  /** Desconectar e informar de si el proveedor confirmó la revocación (TMDb borra la sesión en su lado). */
  function startDisconnect(connectionId: string, purge: boolean) {
    setNotice(null);
    disconnect.mutate(
      { connectionId, purge },
      {
        onSuccess: (result) => {
          if (result.providerRevocation === 'revoked') setNotice({ text: t('sources.revokedAtProvider'), tone: 'ok' });
          if (result.providerRevocation === 'failed') setNotice({ text: t('sources.revokeFailed'), tone: 'error' });
        },
      },
    );
  }

  const busy =
    connect.isPending || sync.isPending || disconnect.isPending || latest?.status === 'queued' || latest?.status === 'running';
  const lastSync = connection?.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString(i18n.language) : t('sources.never');
  const realForDemo = !source.simulated && isDemoUser;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: connection?.status === 'error' ? c.danger : c.border,
        borderRadius: radius.sm,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <Body style={{ fontWeight: '700', flex: 1 }}>{sourceName(t, source.key, source.name)}</Body>
        {source.simulated ? <Badge label={t('common.simulated')} color={c.demo} /> : <Badge label={t('common.realData')} color={c.ok} />}
      </View>
      {source.availability === 'planned' ? (
        <Small>
          {t('sources.plannedPhase', { phase: source.plannedPhase ?? '—' })} · {source.description}
        </Small>
      ) : (
        <>
          <Small>{source.description}</Small>
          {source.availability === 'unconfigured' ? (
            <Small style={{ color: c.warn }}>{t('sources.unconfigured', { reason: source.unavailableReason ?? '' })}</Small>
          ) : null}
          {realForDemo && source.availability !== 'unconfigured' ? (
            <Small style={{ color: c.warn }}>{t('sources.demoOnlyReal')}</Small>
          ) : null}
          {connection ? (
            <Small>
              {t(`sources.status.${connection.status}`)}
              {connection.externalAccountHint ? ` · ${connection.externalAccountHint}` : ''} ·{' '}
              {t('sources.lastSync', { value: lastSync })} · {t('sources.observations', { count: connection.observationCount })}
            </Small>
          ) : null}
          {connection?.status === 'error' ? (
            <View style={{ gap: 2 }}>
              <Badge label={t('sources.needsAction')} color={c.danger} />
              {connection.lastError ? <Small style={{ color: c.danger }}>{connection.lastError}</Small> : null}
            </View>
          ) : null}
          {latest ? <RunSummary run={latest} /> : null}
          {notice ? (
            <Small style={{ color: notice.tone === 'ok' ? c.ok : c.danger, fontWeight: '700' }}>{notice.text}</Small>
          ) : null}
          {connect.error || sync.error || disconnect.error ? (
            <ErrorCard error={connect.error ?? sync.error ?? disconnect.error} />
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
            {!active && source.connectable && source.key === 'steam' ? (
              <View style={{ gap: spacing.xs }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('sources.connectSteam')}
                  disabled={busy}
                  onPress={() => void startConnect()}
                  style={({ pressed }) => ({ opacity: busy ? 0.5 : pressed ? 0.75 : 1 })}
                >
                  <Image
                    source={{ uri: STEAM_SIGN_IN_BUTTON }}
                    style={{ width: 180, height: 35 }}
                    contentFit="contain"
                    accessibilityLabel={t('sources.connectSteam')}
                  />
                </Pressable>
                <Small>{t('sources.steamHelp')}</Small>
              </View>
            ) : null}
            {!active && source.connectable && source.key !== 'steam' ? (
              <View style={{ gap: spacing.xs }}>
                <Button
                  label={connection ? t('sources.reconnect') : t('sources.connect')}
                  icon="link-variant"
                  onPress={() => void startConnect()}
                  loading={connect.isPending}
                />
                {source.key === 'tmdb' ? <Small>{t('sources.tmdbHelp')}</Small> : null}
              </View>
            ) : null}
            {active ? (
              <>
                <Button
                  label={t('sources.sync')}
                  icon="sync"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    sync.mutate({ connectionId: connection.id, mode: source.capabilities.incrementalSync ? 'incremental' : 'full' })
                  }
                />
                {source.capabilities.incrementalSync ? (
                  <Button
                    label={t('sources.fullSync')}
                    icon="database-sync"
                    variant="secondary"
                    disabled={busy}
                    onPress={() => sync.mutate({ connectionId: connection.id, mode: 'full' })}
                  />
                ) : null}
                <Button
                  label={t('sources.disconnect')}
                  icon="link-variant-off"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => startDisconnect(connection.id, false)}
                />
              </>
            ) : null}
            {connection && connection.observationCount > 0 ? (
              <Button
                label={t('sources.disconnectPurge')}
                icon="delete-outline"
                variant="danger"
                disabled={busy}
                onPress={() =>
                  Alert.alert(t('sources.confirmPurgeTitle'), t('sources.confirmPurge'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('sources.disconnectPurge'),
                      style: 'destructive',
                      onPress: () => startDisconnect(connection.id, true),
                    },
                  ])
                }
              />
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Gestión de fuentes: simuladas (solo usuarios de demo), reales disponibles (Steam y TMDb, solo cuentas reales) y reales
 * previstas o sin configurar (no conectables, con el motivo).
 */
export function SourcesCard() {
  const { t } = useTranslation();
  const sources = useSources();
  const connections = useConnections();
  const me = useMe();
  const isDemoUser = me.data?.user.dataset !== 'live';
  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('sources.title')}</Title>
      <Small>{t('sources.help')}</Small>
      {sources.isLoading || connections.isLoading ? <Loading /> : null}
      {sources.isError ? <ErrorCard error={sources.error} onRetry={() => void sources.refetch()} /> : null}
      {sources.data
        ?.filter((source) => !(source.simulated && !isDemoUser))
        .map((source) => (
          <ConnectionRow
            key={source.key}
            source={source}
            connection={connections.data?.find((c) => c.sourceKey === source.key)}
            isDemoUser={isDemoUser}
          />
        ))}
    </Card>
  );
}
