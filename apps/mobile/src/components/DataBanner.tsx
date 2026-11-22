import { useMe } from '../api/queries';
import { DemoBanner } from './ui';

/** Aviso de datos según el usuario de la sesión: simulados (demo) o reales (cuenta local con fuentes reales). */
export function DataBanner({ detailed }: { detailed?: boolean }) {
  const me = useMe();
  return <DemoBanner detailed={detailed} live={me.data?.user.dataset === 'live'} />;
}
