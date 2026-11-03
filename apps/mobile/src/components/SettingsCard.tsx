/**
 * Ajustes del usuario (idioma, ubicación, radio, privacidad, perfil de creador y notificaciones). Antes vivían dentro
 * de Perfil; ahora están en su propia pantalla, agrupados (2026-10-26).
 */
import type { NotificationFrequency, NotificationsStatusDto, SettingsDto } from '@appinity/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import * as Location from 'expo-location';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, Text, View } from 'react-native';
import { useUpdateSettings, type SettingsPatch } from '../api/queries';
import { useSession } from '../state/session';
import {
  Body,
  Button,
  Card,
  ErrorCard,
  Small,
  Title,
} from './ui';
import { radius, spacing, usePalette } from '../theme';

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
        // Área táctil mínima de 44 (revisión de diseño).
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? c.text : c.border,
        backgroundColor: selected ? c.text : 'transparent',
      }}
    >
      <Text style={{ color: selected ? c.background : c.text, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

export function SettingsCard({ settings }: { settings: SettingsDto }) {
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
      <Title>{t('profile.settings')}</Title>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body>{t('profile.discoverableAsSoulmate')}</Body>
          <Small>{t('profile.discoverableAsSoulmateHint')}</Small>
        </View>
        <Switch
          value={settings.discoverableAsSoulmate}
          onValueChange={(value) => save({ discoverableAsSoulmate: value })}
          accessibilityLabel={t('profile.discoverableAsSoulmate')}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body>{t('follow.publicCreator')}</Body>
          <Small>{t('follow.publicCreatorHint')}</Small>
        </View>
        <Switch value={settings.publicCreator} onValueChange={(value) => save({ publicCreator: value })} accessibilityLabel={t('follow.publicCreator')} />
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
      <NotificationsStatus />
    </Card>
  );
}

/** Estado real de las notificaciones (dispositivos y último resumen), sin simular envíos. */
function NotificationsStatus() {
  const { t, i18n } = useTranslation();
  const hasSession = useSession((s) => Boolean(s.session?.token));
  const status = useQuery({ queryKey: ['notifications'], queryFn: () => apiRequest<NotificationsStatusDto>('/v1/me/notifications'), enabled: hasSession });
  if (!status.data) return null;
  const last = status.data.lastDelivery;
  return (
    <>
      <Small>{t('profile.notificationsDevices', { count: status.data.devices })}</Small>
      {last ? (
        <Small>{t('profile.notificationsLast', { date: new Date(last.createdAt).toLocaleString(i18n.language), status: t(`profile.notificationsStatus.${last.status}`) })}</Small>
      ) : null}
      {!status.data.devices ? <Small>{t('profile.notificationsExpoGo')}</Small> : null}
    </>
  );
}
