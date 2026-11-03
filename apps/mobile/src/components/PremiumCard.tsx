import type { PremiumDto } from '@appinity/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../api/client';
import { useSession } from '../state/session';
import { usePalette } from '../theme';
import { Badge, Body, Card, Small, Title } from './ui';

/**
 * Premium (fase 12B). El estado lo decide el servidor (webhooks de RevenueCat); la app solo lo muestra. Todavía no se
 * puede comprar desde la app: falta configurar RevenueCat y las tiendas, y una build de desarrollo (Expo Go no admite
 * compras). Se dice así, sin botones que simulen una compra.
 */
export function PremiumCard() {
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const hasSession = useSession((s) => Boolean(s.session?.token));
  const premium = useQuery({ queryKey: ['premium'], queryFn: () => apiRequest<PremiumDto>('/v1/me/premium'), enabled: hasSession });
  const data = premium.data;
  return (
    <Card>
      <Title>{t('premium.title')}</Title>
      {data ? (
        data.premium ? (
          <Badge
            label={data.expiresAt ? t('premium.activeUntil', { date: new Date(data.expiresAt).toLocaleDateString(i18n.language) }) : t('premium.active')}
            color={c.ok}
          />
        ) : (
          <Badge label={t('premium.inactive')} color={c.textMuted} />
        )
      ) : null}
      <Body muted>{t('premium.includes')}</Body>
      {data && !data.purchasesInApp ? <Small>{t('premium.notPurchasable')}</Small> : null}
      {data?.environment === 'sandbox' ? <Small>{t('premium.sandbox')}</Small> : null}
    </Card>
  );
}
