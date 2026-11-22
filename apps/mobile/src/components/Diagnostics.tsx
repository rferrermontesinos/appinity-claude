import type { CheckResult } from '@appinity/shared';
import { useTranslation } from 'react-i18next';
import { useHealth } from '../api/queries';
import { API } from '../config';
import { usePalette } from '../theme';
import { Body, Button, Card, Row, Small, Title } from './ui';

function checkLabel(check: CheckResult | undefined): string {
  if (!check) return '—';
  return check.ok ? `OK${check.latencyMs !== undefined ? ` · ${check.latencyMs} ms` : ''}` : `✕ ${check.detail ?? ''}`;
}

/** Comprueba desde el teléfono que la API, la base de datos y Redis responden. */
export function Diagnostics() {
  const { t } = useTranslation();
  const c = usePalette();
  const health = useHealth();
  const sourceLabel =
    API.source === 'env'
      ? t('diagnostics.apiUrlSourceEnv')
      : API.source === 'metro'
        ? t('diagnostics.apiUrlSourceMetro')
        : t('diagnostics.apiUrlSourceDefault');

  const status = health.isError
    ? { label: t('diagnostics.unreachable'), color: c.danger }
    : health.data?.status === 'ok'
      ? { label: t('diagnostics.ok'), color: c.ok }
      : health.data
        ? { label: t('diagnostics.degraded'), color: c.warn }
        : { label: t('common.loading'), color: c.textMuted };

  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('diagnostics.title')}</Title>
      <Row label={t('diagnostics.apiUrl')} value={API.url} />
      <Row label={t('diagnostics.apiUrlSource')} value={sourceLabel} />
      <Row label={t('diagnostics.status')} value={status.label} valueColor={status.color} />
      {health.data ? (
        <>
          <Row label={t('diagnostics.database')} value={checkLabel(health.data.checks.database)} />
          <Row label={t('diagnostics.postgis')} value={checkLabel(health.data.checks.postgis)} />
          <Row label={t('diagnostics.redis')} value={checkLabel(health.data.checks.redis)} />
          <Row label="Worker" value={checkLabel(health.data.checks.worker)} />
          <Row
            label={t('diagnostics.mode')}
            value={`${health.data.mode.environment}${health.data.mode.demoMode ? ' · DEMO_MODE' : ''} · API ${health.data.version}`}
          />
        </>
      ) : null}
      {health.isError ? (
        <>
          <Small style={{ color: c.danger }}>{(health.error as Error).message}</Small>
          <Body muted>{t('diagnostics.help')}</Body>
        </>
      ) : null}
      <Button label={t('diagnostics.test')} variant="secondary" icon="lan-connect" onPress={() => void health.refetch()} loading={health.isFetching} />
    </Card>
  );
}
