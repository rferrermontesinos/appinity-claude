/**
 * Usuarios SIMULADOS de la demo (dataset 'demo'). Sus nombres llevan el sufijo "(demo)" y no
 * corresponden a personas reales. Sus zonas son aproximadas y deterministas.
 */
export interface DemoUserSeed {
  id: string;
  handle: string;
  displayName: string;
  countryCode: string;
  note: string;
  locale: 'es' | 'en';
  location: { label: string; latitude: number; longitude: number };
}

export const DEMO_USERS: readonly DemoUserSeed[] = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    handle: 'demo_laura',
    displayName: 'Laura (demo)',
    countryCode: 'ES',
    note: 'Cine clásico, libros y restaurantes de Barcelona. Cubre todos los casos del modelo (watchlist, visto sin nota, notas altas y bajas, duplicados entre fuentes, fechas ausentes).',
    locale: 'es',
    location: { label: 'Barcelona · Gràcia', latitude: 41.4, longitude: 2.16 },
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    handle: 'demo_alex',
    displayName: 'Àlex (demo)',
    countryCode: 'ES',
    note: 'Videojuegos y música. Incluye un juego comprado con 0 horas y escuchas agregadas por artista.',
    locale: 'es',
    location: { label: 'Barcelona · Eixample', latitude: 41.39, longitude: 2.16 },
  },
  {
    id: '00000000-0000-4000-a000-000000000003',
    handle: 'demo_marta',
    displayName: 'Marta (demo)',
    countryCode: 'ES',
    note: 'Restaurantes y cultura. Incluye asistencia inferida frente a una valoración negativa explícita.',
    locale: 'es',
    location: { label: 'Barcelona · Ciutat Vella', latitude: 41.38, longitude: 2.18 },
  },
  {
    id: '00000000-0000-4000-a000-000000000004',
    handle: 'demo_jordi',
    displayName: 'Jordi (demo)',
    countryCode: 'ES',
    note: 'Vive en Girona, fuera del radio de 10 km de Barcelona. Útil para comprobar filtros de zona en fases posteriores.',
    locale: 'es',
    location: { label: 'Girona', latitude: 41.98, longitude: 2.82 },
  },
  {
    id: '00000000-0000-4000-a000-000000000005',
    handle: 'demo_nuria',
    displayName: 'Núria (demo)',
    countryCode: 'ES',
    note: 'Series y podcasts. Episodios agregados por programa.',
    locale: 'es',
    location: { label: 'Barcelona · Sants', latitude: 41.37, longitude: 2.14 },
  },
  {
    id: '00000000-0000-4000-a000-000000000006',
    handle: 'demo_sam',
    displayName: 'Sam (demo)',
    countryCode: 'GB',
    note: 'Sin fuentes conectadas: muestra el estado vacío y la falta de evidencia (NULL, nunca 0).',
    locale: 'en',
    location: { label: 'Barcelona · Poblenou', latitude: 41.4, longitude: 2.2 },
  },
];
