import { useRouter } from 'expo-router';

/** Momento de la última apertura (común a toda la app). */
let lastOpen = 0;

/**
 * Abre la ficha de una obra. Un doble toque no apila dos fichas iguales: se ignora otra apertura durante 800 ms
 * (antes, tocar dos veces la tarjeta de Inicio abría la ficha dos veces).
 */
export function useOpenItem() {
  const router = useRouter();
  return (id: string) => {
    const now = Date.now();
    if (now - lastOpen < 800) return;
    lastOpen = now;
    router.push({ pathname: '/item/[id]', params: { id } });
  };
}
