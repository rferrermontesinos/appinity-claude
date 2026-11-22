import type { ConnectionDto, SyncRunDto } from '@appinity/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { useConnect, useConnections, useDisconnect, useRuns, useSources, useSync, type SourceView } from '../api/queries';
import { radius, spacing, usePalette } from '../theme';
import { Badge, Body, Button, Card, ErrorCard, Loading, Small, Title } from './ui';

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

function ConnectionRow({ source, connection }: { source: SourceView; connection: ConnectionDto | undefined }) {
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const queryClient = useQueryClient();
  const connect = useConnect();
  const sync = useSync();
  const disconnect = useDisconnect();
  const active = connection && connection.status !== 'revoked';
  const runs = useRuns(connection?.id);
  const latest = connection ? runs.data?.[0] : undefined;

  // Cuando el worker termina un sync, refresca conexiones y perfiles.
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    const status = latest?.status;
    const wasPending = previous.current === 'queued' || previous.current === 'running';
    if (wasPending && status && status !== 'queued' && status !== 'running') {
      void queryClient.invalidateQueries({ queryKey: ['connections'] });
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    }
    previous.current = status;
  }, [latest?.status, queryClient]);

  const busy = connect.isPending || sync.isPending || disconnect.isPending || latest?.status === 'queued' || latest?.status === 'running';
  const lastSync = connection?.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString(i18n.language) : t('sources.never');

  return (
    <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <Body style={{ fontWeight: '700', flex: 1 }}>{sourceName(t, source.key, source.name)}</Body>
        {source.simulated ? <Badge label={t('common.simulated')} color={c.demo} /> : null}
      </View>
      {source.availability === 'planned' ? (
        <Small>{t('sources.plannedPhase', { phase: source.plannedPhase ?? '—' })} · {source.description}</Small>
      ) : (
        <>
          <Small>{source.description}</Small>
          {connection ? (
            <Small>
              {t(`sources.status.${connection.status}`)} · {t('sources.lastSync', { value: lastSync })} ·{' '}
              {t('sources.observations', { count: connection.observationCount })}
            </Small>
          ) : null}
          {latest ? <RunSummary run={latest} /> : null}
          {connect.error || sync.error || disconnect.error ? <ErrorCard error={connect.error ?? sync.error ?? disconnect.error} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {!active && source.connectable ? (
              <Button
                label={connection ? t('sources.reconnect') : t('sources.connect')}
                icon="link-variant"
                onPress={() => connect.mutate(source.key)}
                loading={connect.isPending}
              />
            ) : null}
            {active ? (
              <>
                <Button
                  label={t('sources.sync')}
                  icon="sync"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => sync.mutate({ connectionId: connection.id, mode: 'incremental' })}
                />
                <Button
                  label={t('sources.fullSync')}
                  icon="database-sync"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => sync.mutate({ connectionId: connection.id, mode: 'full' })}
                />
                <Button
                  label={t('sources.disconnect')}
                  icon="link-variant-off"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => disconnect.mutate({ connectionId: connection.id, purge: false })}
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
                      onPress: () => disconnect.mutate({ connectionId: connection.id, purge: true }),
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

/** Gestión de fuentes: simuladas (conectables en la demo) y reales previstas (no disponibles todavía). */
export function SourcesCard() {
  const { t } = useTranslation();
  const sources = useSources();
  const connections = useConnections();
  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('sources.title')}</Title>
      <Small>{t('sources.help')}</Small>
      {sources.isLoading || connections.isLoading ? <Loading /> : null}
      {sources.isError ? <ErrorCard error={sources.error} onRetry={() => void sources.refetch()} /> : null}
      {sources.data?.map((source) => (
        <ConnectionRow key={source.key} source={source} connection={connections.data?.find((c) => c.sourceKey === source.key)} />
      ))}
    </Card>
  );
}
