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
  {
    id: '00000000-0000-4000-a000-000000000007',
    handle: 'demo_clara',
    displayName: 'Clara (demo)',
    countryCode: 'ES',
    note: 'Persona sintética (fase 6): mismas notas que Laura en cine, series y libros, y parecidas en lugares. Es su alma gemela más afín.',
    locale: 'es',
    location: { label: 'Barcelona · Sarrià', latitude: 41.4, longitude: 2.12 },
  },
  {
    id: '00000000-0000-4000-a000-000000000008',
    handle: 'demo_pau',
    displayName: 'Pau (demo)',
    countryCode: 'ES',
    note: 'Persona sintética (fase 6): notas opuestas a las de Laura en cine, series y libros. Afinidad baja (las notas cercanas al término medio siguen coincidiendo en parte), no NULL.',
    locale: 'es',
    location: { label: 'Barcelona · Sant Andreu', latitude: 41.43, longitude: 2.19 },
  },
  {
    id: '00000000-0000-4000-a000-000000000009',
    handle: 'demo_iris',
    displayName: 'Iris (demo)',
    countryCode: 'ES',
    note: 'Persona sintética (fase 6): restaurantes y cultura parecidos a los de Marta.',
    locale: 'es',
    location: { label: 'Barcelona · Born', latitude: 41.385, longitude: 2.183 },
  },
  {
    id: '00000000-0000-4000-a000-000000000010',
    handle: 'demo_leo',
    displayName: 'Leo (demo)',
    countryCode: 'PT',
    note: 'Persona sintética (fase 6): videojuegos y música como Àlex (preferencias inferidas de horas y escuchas).',
    locale: 'en',
    location: { label: 'Barcelona · Poble-sec', latitude: 41.373, longitude: 2.162 },
  },
  {
    id: '00000000-0000-4000-a000-000000000011',
    handle: 'demo_ona',
    displayName: 'Ona (demo)',
    countryCode: 'ES',
    note: 'Persona sintética (fase 6): series y podcasts como Núria.',
    locale: 'es',
    location: { label: 'Barcelona · Les Corts', latitude: 41.385, longitude: 2.13 },
  },
  {
    id: '00000000-0000-4000-a000-000000000012',
    handle: 'demo_teo',
    displayName: 'Teo (demo)',
    countryCode: 'FR',
    note: 'Persona sintética (fase 6): cine como Laura y restaurantes al revés que Marta. Afinidades por categoría muy distintas.',
    locale: 'en',
    location: { label: 'Barcelona · Horta', latitude: 41.43, longitude: 2.16 },
  },
  {
    id: '00000000-0000-4000-a000-000000000013',
    handle: 'demo_vera',
    displayName: 'Vera (demo)',
    countryCode: 'IT',
    note: 'Persona sintética (fase 6): muy poca evidencia en común con Laura. No debería obtener una afinidad alta.',
    locale: 'en',
    location: { label: 'Badalona', latitude: 41.45, longitude: 2.25 },
  },
];
