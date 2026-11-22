import { useTranslation } from 'react-i18next';
import { Card, PendingNotice, Screen, Title } from '../../src/components/ui';

/** People: almas gemelas y amigos. Sin motor de afinidad todavía, no se muestran personas ni porcentajes. */
export default function PeopleScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Card>
        <Title>{t('people.soulmates')}</Title>
        <PendingNotice phase="5–6" text={t('people.soulmatesPending')} />
      </Card>
      <Card>
        <Title>{t('people.friends')}</Title>
        <PendingNotice phase="10" text={t('people.friendsPending')} />
      </Card>
    </Screen>
  );
}
