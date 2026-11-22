# Capacidades de integración · APPINITY Claude

Estado verificado de cada fuente. **Nada está disponible como integración real hasta que su fila lo diga con
evidencia.** Las capacidades de un manifest solo reflejan lo comprobado en la documentación oficial y en una
conexión real. Las fuentes simuladas no validan ninguna integración real.

## Fuentes simuladas (DEMO_MODE) · fase 1

Comparten la estructura común de `packages/integrations/src/profile/<fuente>/` (`index`, `manifest`, `auth`,
`client`, `sync`, `mapper`, `schemas`, `constants`, `fixtures`) y el mismo contrato y pipeline que usarán las reales.
Leen actividad **ficticia** de archivos del repositorio sobre objetos **reales** del catálogo de la demo.
`authentication: 'fixture'`: no hay OAuth, credenciales ni proveedores.

| Clave | Imita la clase de evidencia de | Categorías | Sync | Señales simuladas | Mapper |
|---|---|---|---|---|---|
| `fixture_screen` | TMDb | movies, series | incremental, paginado | Valoración 1–10, watchlist, visto sin valoración (y un registro inválido a propósito) | `fixture-screen-v1` |
| `fixture_diary` | Diarios tipo Letterboxd/Goodreads | movies, books | incremental, paginado | Estrellas 0,5–5, «quiero», registro sin nota, ISBN de edición, fechas solo con año, libro sin IDs | `fixture-diary-v1` |
| `fixture_activity` | Google (Maps/actividad) | food, culture, movies | incremental, paginado | Guardado, reseña 1–5, visita inferida, asistencia confirmada, evento de calendario, pulgares | `fixture-activity-v1` |
| `fixture_play` | Steam | games | instantánea completa | Biblioteca con minutos (incluidos 0 min), último uso; appid no presente en el catálogo | `fixture-play-v1` |
| `fixture_audio` | Last.fm (+ podcasts) | music, podcasts | instantánea completa | Escuchas por artista, canciones favoritas, episodios (agregados por programa), suscripciones | `fixture-audio-v1` |

Parámetros de normalización: [decisions.md](decisions.md#normalización-y-parámetros-de-los-mappers-fixture-propuestas-sin-calibrar).
Tests: `packages/integrations/test/fixture-adapter.test.ts` (registro en bruto → observaciones esperadas, contrato,
paginación, instantáneas, agregación) y `packages/ingestion/test/pipeline.int.test.ts` (pipeline completo).

## Fuentes reales previstas

Se muestran en la app como «Próximamente · fase N» y no son conectables. Sus manifests declaran todas las
capacidades a `false` hasta verificarlas.

| Fuente | Categorías | Autenticación prevista | Estado | Evidencia |
|---|---|---|---|---|
| Steam | games | OpenID (identificación) + Web API key (datos). No OAuth | Pendiente · fase 2 | Ficha por crear con la documentación oficial de Valve |
| TMDb | movies, series | Por verificar | Pendiente · fase 3 | — |
| Last.fm | music | Por verificar | Pendiente · fase 4 | — |
| Google Activity / Data Portability | potencialmente las ocho | Por verificar | Pendiente · fase 11 | — |
| Apple Music | music | Por verificar | Pendiente · fase 11 | — |
| SoundCloud, Plex, Google Books, Podchaser, Eventbrite, calendario del dispositivo | ver especificación §9 | Por verificar | Pendiente · fase 11 | — |

Antes de implementar cada fuente real se añadirá su ficha: documentación oficial, endpoints, scopes, aprobación,
paginación, límites, permisos de almacenamiento y política de revocación.

## Proveedores de catálogo

| Clave | Tipo | Estado |
|---|---|---|
| `wikidata_snapshot` | Instantánea congelada de Wikidata (CC0) + imágenes de Wikimedia Commons con licencia libre | Implementado para la demo (`dataset = demo`). No llama a la red en tiempo de ejecución |
| TMDb, MusicBrainz, Open Library, etc. como proveedores en vivo | — | Pendiente; se decidirá con cada fuente real |
