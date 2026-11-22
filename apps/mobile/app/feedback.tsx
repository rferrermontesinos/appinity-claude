import { FEEDBACK_MAX_LENGTH } from '@appinity/shared';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView } from 'react-native';
import { ApiError } from '../src/api/client';
import { useSendFeedback } from '../src/api/queries';
import { APP_PLATFORM, APP_VERSION } from '../src/app-info';
import { Body, Button, Card, ErrorCard, Screen, Small, TextField, Title } from '../src/components/ui';
import { usePalette } from '../src/theme';

/**
 * «Enviar comentario» (fase B5): un texto libre para los testers de la beta. Se guarda con la versión de la app y la
 * plataforma; nada más (ni capturas ni la pantalla que estaban viendo). El titular los lee con `pnpm feedback:list`.
 */
export default function FeedbackScreen() {
  const { t } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const send = useSendFeedback();
  const [message, setMessage] = useState('');
  const trimmed = message.trim();
  const rateLimited = send.error instanceof ApiError && send.error.status === 429;

  const submit = () => {
    if (!trimmed || !APP_PLATFORM || send.isPending) return;
    send.mutate({ message: trimmed, appVersion: APP_VERSION, platform: APP_PLATFORM }, { onSuccess: () => setMessage('') });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior="padding">
      <Screen keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: t('feedback.title') }} />
        {send.isSuccess ? (
          <Card>
            <Title>{t('feedback.sentTitle')}</Title>
            <Body>{t('feedback.sentBody')}</Body>
            <Button label={t('feedback.sendAnother')} icon="message-plus-outline" variant="secondary" onPress={() => send.reset()} />
            <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
          </Card>
        ) : (
          <>
            <Body>{t('feedback.intro')}</Body>
            <TextField
              label={t('feedback.label')}
              placeholder={t('feedback.placeholder')}
              help={t('feedback.count', { count: message.length, max: FEEDBACK_MAX_LENGTH })}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={FEEDBACK_MAX_LENGTH}
            />
            {rateLimited ? <Small style={{ color: c.danger }}>{t('feedback.rateLimited')}</Small> : null}
            {send.isError && !rateLimited ? <ErrorCard error={send.error} /> : null}
            <Button label={t('feedback.send')} icon="send" loading={send.isPending} disabled={!trimmed || !APP_PLATFORM} onPress={submit} />
            <Small>{t('feedback.privacy', { version: APP_VERSION })}</Small>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
