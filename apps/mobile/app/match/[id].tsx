import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useConversation, useMe } from '../../src/api/queries';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { Body, Button, ErrorCard, Loading } from '../../src/components/ui';
import { spacing, usePalette } from '../../src/theme';

/**
 * «¡Es un match!» (como en Tinder): aparece justo cuando quien usa la app provoca el match (acepta una solicitud o
 * muestra interés por alguien que ya lo había mostrado). Ofrece escribir ya o seguir explorando.
 */
export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const c = usePalette();
  const me = useMe();
  const conversation = useConversation(id ?? '');
  const person = conversation.data?.conversation.person;
  const affinity = person ? formatAffinity(person.affinity) : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/people'));
  return (
    <View style={{ flex: 1, backgroundColor: c.accent, padding: spacing.xl, justifyContent: 'center', gap: spacing.xl }}>
      {conversation.isLoading ? <Loading /> : null}
      {conversation.error ? <ErrorCard error={conversation.error} onRetry={() => void conversation.refetch()} /> : null}
      {person ? (
        <>
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <MaterialCommunityIcons name="cards-heart" size={44} color={c.accentText} />
            <Text accessibilityRole="header" style={{ color: c.accentText, fontSize: 36, fontWeight: '900', textAlign: 'center' }}>
              {t('chat.matchTitle')}
            </Text>
            <Body style={{ color: c.accentText, textAlign: 'center', alignSelf: 'stretch' }}>{t(affinity === null || Number(affinity) < 50 ? 'chat.matchBodyNoAffinity' : 'chat.matchBody', { name: person.displayName })}</Body>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg }}>
            <View style={{ borderWidth: 3, borderColor: c.accentText, borderRadius: 60, padding: 2, backgroundColor: c.surface }}>
              <PersonAvatar name={me.data?.user.displayName ?? '·'} url={null} size={96} />
            </View>
            <View style={{ borderWidth: 3, borderColor: c.accentText, borderRadius: 60, padding: 2, backgroundColor: c.surface }}>
              <PersonAvatar name={person.displayName} url={person.avatarUrl} size={96} />
            </View>
          </View>
          {affinity !== null ? (
            <Text style={{ color: c.accentText, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{t('chat.matchAffinity', { value: affinity })}</Text>
          ) : null}
          <View style={{ gap: spacing.sm, backgroundColor: c.surface, borderRadius: 16, padding: spacing.md }}>
            <Button label={t('chat.sendMessage')} icon="chat-outline" onPress={() => router.replace(`/chat/${id}`)} />
            <Button label={t('chat.keepExploring')} variant="secondary" onPress={close} />
          </View>
        </>
      ) : null}
    </View>
  );
}
