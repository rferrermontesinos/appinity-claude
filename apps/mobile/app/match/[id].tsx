import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useConversation, useMe } from '../../src/api/queries';
import { Glow, Grain, onPoster } from '../../src/components/Aura';
import { PersonAvatar, formatAffinity } from '../../src/components/PersonAvatar';
import { Button, ErrorCard, Skeleton } from '../../src/components/ui';
import { spacing, type } from '../../src/theme';

/**
 * «¡Es un match!» (como en Tinder), en «Aura»: cartel a pantalla completa (fondo oscuro fijo, brillo lima de la
 * afinidad y grano), las dos caras con aro lima y la afinidad en lima. La chispa queda para la acción principal
 * (escribir). Aparece justo cuando quien usa la app provoca el match.
 */
export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const me = useMe();
  const conversation = useConversation(id ?? '');
  const person = conversation.data?.conversation.person;
  const affinity = person ? formatAffinity(person.affinity) : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/people'));
  return (
    <View style={{ flex: 1, backgroundColor: onPoster.base, padding: spacing.xl, justifyContent: 'center', gap: spacing.xl }}>
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Glow color={onPoster.lime} size={width * 1.3} x={width * 0.5} y={height * 0.32} strength={0.014} />
        <Grain opacity={0.25} />
      </View>
      {conversation.isLoading ? <Skeleton rows={2} height={120} /> : null}
      {conversation.error ? <ErrorCard error={conversation.error} onRetry={() => void conversation.refetch()} /> : null}
      {person ? (
        <>
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <Text style={{ color: onPoster.lime, ...type.overline }}>{t('chat.matchKicker')}</Text>
            <Text accessibilityRole="header" style={{ color: onPoster.text, ...type.display, textAlign: 'center' }}>
              {t('chat.matchTitle')}
            </Text>
            <Text style={{ color: onPoster.muted, ...type.body, textAlign: 'center', alignSelf: 'stretch' }}>
              {t(affinity === null || Number(affinity) < 50 ? 'chat.matchBodyNoAffinity' : 'chat.matchBody', { name: person.displayName })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg }}>
            <PersonAvatar name={me.data?.user.displayName ?? '·'} url={null} size={96} ring={onPoster.lime} />
            <PersonAvatar name={person.displayName} url={person.avatarUrl} size={96} ring={onPoster.lime} />
          </View>
          {affinity !== null ? (
            <Text style={{ color: onPoster.lime, ...type.h2, textAlign: 'center' }}>{t('chat.matchAffinity', { value: affinity })}</Text>
          ) : null}
          <View style={{ gap: spacing.sm }}>
            <Button label={t('chat.sendMessage')} icon="chat-outline" onPress={() => router.replace(`/chat/${id}`)} />
            <Button label={t('chat.keepExploring')} variant="secondary" onPress={close} />
          </View>
        </>
      ) : null}
    </View>
  );
}
