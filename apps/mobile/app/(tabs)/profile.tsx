import type { NotificationFrequency, SettingsDto } from '@appinity/shared';
import * as Location from 'expo-location';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, Text, View } from 'react-native';
import { useMe, useUpdateSettings, type SettingsPatch } from '../../src/api/queries';
import { CreditsCard } from '../../src/components/CreditsCard';
import { DataBanner } from '../../src/components/DataBanner';
import { Diagnostics } from '../../src/components/Diagnostics';
import { SourcesCard } from '../../src/components/SourcesCard';
import {
  Badge,
  Body,
  Button,
  Card,
  ErrorCard,
  Loading,
  PendingNotice,
  Row,
  Screen,
  Small,
  Title,
} from '../../src/components/ui';
import { useSession } from '../../src/state/session';
import { radius, spacing, usePalette } from '../../src/theme';

const RADIUS_PRESETS = [1, 5, 10, 20, 30, 50];
const FREQUENCIES: NotificationFrequency[] = ['daily', 'three_per_week', 'weekly', 'off'];
const MANUAL_AREAS = [
  { label: 'Barcelona', latitude: 41.39, longitude: 2.17 },
  { label: 'Madrid', latitude: 40.42, longitude: -3.7 },
  { label: 'València', latitude: 39.47, longitude: -0.38 },
  { label: 'Girona', latitude: 41.98, longitude: 2.82 },
  { label: 'Sevilla', latitude: 37.39, longitude: -5.99 },
];

/** Redondeo a ~1 km antes de enviar: solo viaja una zona aproximada. */
const approx = (v: number) => Math.round(v * 100) / 100;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? `${c.accent}22` : 'transparent',
      }}
    >
      <Text style={{ color: selected ? c.accent : c.text, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

function SettingsCard({ settings }: { settings: SettingsDto }) {
  const { t } = useTranslation();
  const c = usePalette();
  const update = useUpdateSettings();
  const [locationError, setLocationError] = useState<string | null>(null);
  const save = (patch: SettingsPatch) => update.mutate(patch);

  async function setLocationFromDevice() {
    setLocationError(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLocationError(t('profile.locationDenied'));
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const [place] = await Location.reverseGeocodeAsync(position.coords).catch(() => []);
    save({
      location: {
        label: place?.city ?? place?.subregion ?? place?.region ?? t('profile.currentArea'),
        latitude: approx(position.coords.latitude),
        longitude: approx(position.coords.longitude),
        source: 'device',
      },
    });
  }

  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('profile.settings')}</Title>
      {update.isError ? <ErrorCard error={update.error} /> : null}

      <Small style={{ fontWeight: '700' }}>{t('profile.language')}</Small>
      <ChipRow>
        <Chip label="Español" selected={settings.locale === 'es'} onPress={() => save({ locale: 'es' })} />
        <Chip label="English" selected={settings.locale === 'en'} onPress={() => save({ locale: 'en' })} />
      </ChipRow>

      <Small style={{ fontWeight: '700', marginTop: spacing.sm }}>{t('profile.location')}</Small>
      <Body>
        {settings.location
          ? `${settings.location.label} · ${settings.location.latitude.toFixed(2)}, ${settings.location.longitude.toFixed(2)} (${settings.location.source})`
          : t('profile.locationNone')}
      </Body>
      <Small>{t('profile.locationManual')}</Small>
      <ChipRow>
        {MANUAL_AREAS.map((area) => (
          <Chip
            key={area.label}
            label={area.label}
            selected={settings.location?.label === area.label}
            onPress={() => save({ location: { ...area, source: 'manual' } })}
          />
        ))}
      </ChipRow>
      <Button label={t('profile.locationDevice')} variant="secondary" icon="crosshairs-gps" onPress={() => void setLocationFromDevice()} />
      <Small>{t('profile.locationDeviceHelp')}</Small>
      {locationError ? <Small style={{ color: c.danger }}>{locationError}</Small> : null}

      <Small style={{ fontWeight: '700', marginTop: spacing.sm }}>
        {t('profile.radius')} · {t('profile.radiusValue', { km: settings.radiusKm })}
      </Small>
      <ChipRow>
        <Chip label="−" selected={false} onPress={() => save({ radiusKm: Math.max(1, settings.radiusKm - 1) })} />
        {RADIUS_PRESETS.map((km) => (
          <Chip key={km} label={`${km}`} selected={settings.radiusKm === km} onPress={() => save({ radiusKm: km })} />
        ))}
        <Chip label="+" selected={false} onPress={() => save({ radiusKm: Math.min(50, settings.radiusKm + 1) })} />
      </ChipRow>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm }}>
        <Body style={{ flex: 1 }}>{t('profile.discoverable')}</Body>
        <Switch
          value={settings.discoverableByContacts}
          onValueChange={(value) => save({ discoverableByContacts: value })}
          accessibilityLabel={t('profile.discoverable')}
        />
      </View>

      <Small style={{ fontWeight: '700', marginTop: spacing.sm }}>{t('profile.notifications')}</Small>
      <ChipRow>
        {FREQUENCIES.map((f) => (
          <Chip
            key={f}
            label={t(`profile.notificationsValue.${f}`)}
            selected={settings.notificationFrequency === f}
            onPress={() => save({ notificationFrequency: f })}
          />
        ))}
      </ChipRow>
      <Small>{t('profile.notificationsPending')}</Small>
    </Card>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const me = useMe();
  const clear = useSession((s) => s.clear);

  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => void me.refetch()}>
      <DataBanner />
      {me.isLoading ? <Loading /> : null}
      {me.isError ? <ErrorCard error={me.error} onRetry={() => void me.refetch()} /> : null}
      {me.data ? (
        <>
          <Card>
            <Title style={{ fontSize: 16 }}>{t('profile.identity')}</Title>
            <Row label={me.data.user.displayName} value={`@${me.data.user.handle}`} />
            <Row label={t('profile.country')} value={me.data.user.countryCode ?? '—'} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Badge label={t('profile.devIdentity')} color={c.demo} />
              <Badge label={`dataset: ${me.data.user.dataset}`} color={c.textMuted} />
            </View>
            <Small>{t('profile.devIdentityHelp')}</Small>
            <Button label={t('profile.switchUser')} variant="secondary" icon="account-switch" onPress={() => void clear()} />
          </Card>
          <SourcesCard />
          <SettingsCard settings={me.data.settings} />
          <Card>
            <Title style={{ fontSize: 16 }}>{t('profile.subscription')}</Title>
            <PendingNotice phase="12" text={t('profile.subscriptionPending')} />
          </Card>
        </>
      ) : null}
      <CreditsCard />
      <Diagnostics />
    </Screen>
  );
}
