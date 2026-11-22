import type { MeDto } from '@appinity/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { apiRequest } from '../api/client';
import { useSession } from '../state/session';
import { spacing } from '../theme';
import { Body, Button, Card, ErrorCard, Small, TextField, Title } from './ui';

/**
 * Cuenta de producción (fase 13): cerrar sesión y eliminar la cuenta. Eliminar revoca los permisos concedidos a los
 * proveedores y borra todo lo de la persona; se confirma escribiendo ELIMINAR.
 */
export function AccountCard({ me }: { me: MeDto }) {
  const { t } = useTranslation();
  const clear = useSession((s) => s.clear);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (me.authKind !== 'user') return null;

  async function logout() {
    setBusy(true);
    await apiRequest('/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await clear();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/v1/me', { method: 'DELETE', body: { confirm: 'ELIMINAR' } });
      await clear();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Card>
      <Title style={{ fontSize: 16 }}>{t('account.title')}</Title>
      <Button label={t('account.logout')} variant="secondary" icon="logout" onPress={() => void logout()} disabled={busy} />
      <Button label={t('account.delete')} variant="danger" icon="delete-outline" onPress={() => setConfirming((v) => !v)} disabled={busy} />
      {confirming ? (
        <View style={{ gap: spacing.sm }}>
          <Body>{t('account.deleteConfirm')}</Body>
          <TextField label={t('account.deleteType')} value={typed} onChangeText={setTyped} autoCapitalize="characters" placeholder="ELIMINAR" />
          <Button label={t('account.deleteFinal')} variant="danger" onPress={() => void remove()} disabled={typed.trim() !== 'ELIMINAR'} loading={busy} />
          <Small>{t('account.deleteNote')}</Small>
        </View>
      ) : null}
      {error ? <ErrorCard error={error} /> : null}
    </Card>
  );
}
