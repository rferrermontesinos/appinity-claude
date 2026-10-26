import { CONTACT_HASH_BATCH_MAX, normalizeContactEmail, type ContactMatchDto } from '@appinity/shared';
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';
import { apiRequest } from '../api/client';
import { useSocialAction } from '../api/queries';
import { spacing, usePalette } from '../theme';
import { PersonAvatar, formatAffinity } from './PersonAvatar';
import { Body, Button, ErrorCard, Small } from './ui';

/** La API admite 5 peticiones por minuto: como mucho 5 lotes por búsqueda (2.500 emails). */
const MAX_BATCHES = 5;

type State =
  | { step: 'idle' }
  | { step: 'denied' }
  | { step: 'searching' }
  | { step: 'done'; matches: ContactMatchDto[]; emails: number; truncated: boolean };

/** Lee los emails de la agenda (solo bajo demanda) y envía su SHA-256; nada sale del teléfono en claro ni se guarda. */
async function hashedContactEmails(): Promise<{ hashes: string[]; truncated: boolean }> {
  const details = await Contact.getAllDetails([ContactField.EMAILS]);
  const emails = new Set<string>();
  for (const contact of details) {
    for (const e of contact.emails ?? []) {
      const normalized = e.address ? normalizeContactEmail(e.address) : null;
      if (normalized) emails.add(normalized);
    }
  }
  const limit = CONTACT_HASH_BATCH_MAX * MAX_BATCHES;
  const list = [...emails].slice(0, limit);
  const hashes = await Promise.all(list.map((e) => digestStringAsync(CryptoDigestAlgorithm.SHA256, e)));
  return { hashes, truncated: emails.size > limit };
}

/** Amigos desde los contactos (§4): permiso del sistema solo al pulsar, y resultados solo en memoria. */
export function ContactsFinder() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const action = useSocialAction();
  const [state, setState] = useState<State>({ step: 'idle' });
  const [error, setError] = useState<unknown>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  if (Platform.OS === 'web') return <Small>{t('contacts.mobileOnly')}</Small>;

  async function search() {
    setError(null);
    const permission = await requestPermissionsAsync();
    if (!permission.granted) {
      setState({ step: 'denied' });
      return;
    }
    setState({ step: 'searching' });
    try {
      const { hashes, truncated } = await hashedContactEmails();
      const matches: ContactMatchDto[] = [];
      for (let i = 0; i < hashes.length; i += CONTACT_HASH_BATCH_MAX) {
        const batch = hashes.slice(i, i + CONTACT_HASH_BATCH_MAX);
        matches.push(...(await apiRequest<ContactMatchDto[]>('/v1/me/contacts/match', { method: 'POST', body: { hashes: batch } })));
      }
      setState({ step: 'done', matches, emails: hashes.length, truncated });
    } catch (e) {
      setError(e);
      setState({ step: 'idle' });
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Small style={{ fontWeight: '700' }}>{t('contacts.title')}</Small>
      <Small>{t('contacts.privacy')}</Small>
      {state.step === 'denied' ? <Small style={{ color: c.warn }}>{t('contacts.denied')}</Small> : null}
      {error ? <ErrorCard error={error} /> : null}
      {state.step === 'done' ? (
        <>
          <Small>{t('contacts.result', { count: state.matches.length, emails: state.emails })}</Small>
          {state.truncated ? <Small>{t('contacts.truncated')}</Small> : null}
          {state.matches.map((p) => {
            const value = formatAffinity(p.affinity);
            const pending = p.friendship === 'pending_out' || requested.has(p.userId);
            return (
              <View key={p.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={p.displayName}
                  onPress={() => router.push(`/person/${p.userId}`)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}
                >
                  <PersonAvatar name={p.displayName} url={p.avatarUrl} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={1}>
                      {p.displayName}
                    </Text>
                    <Small>
                      {t('people.affinity')}: {value === null ? '—' : t('people.affinityValue', { value })}
                    </Small>
                  </View>
                </Pressable>
                {p.friendship === 'friends' ? (
                  <Small>{t('contacts.alreadyFriends')}</Small>
                ) : p.friendship === 'pending_in' ? (
                  <Small>{t('contacts.wantsYou')}</Small>
                ) : pending ? (
                  <Small>{t('contacts.requested')}</Small>
                ) : (
                  <Button
                    label={t('contacts.add')}
                    size="small"
                    disabled={action.isPending}
                    onPress={() =>
                      action.mutate(
                        { kind: 'request', userId: p.userId },
                        { onSuccess: () => setRequested((prev) => new Set(prev).add(p.userId)) },
                      )
                    }
                  />
                )}
              </View>
            );
          })}
          {!state.matches.length ? <Body muted>{t('contacts.none')}</Body> : null}
        </>
      ) : null}
      <Button
        label={state.step === 'done' ? t('contacts.searchAgain') : t('contacts.search')}
        icon="card-account-mail-outline"
        variant="secondary"
        size="small"
        loading={state.step === 'searching'}
        onPress={() => void search()}
      />
    </View>
  );
}
