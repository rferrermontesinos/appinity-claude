# Fuentes de gustos candidatas · fase 11 (2026-10-14)

Objetivo: construir el perfil del usuario a partir de sus gustos (núcleo de APPINITY), priorizando fuentes usadas en todo
el mundo, gratuitas para una app comercial y sencillas de integrar.

Restricción de producto: **un único consentimiento, en el alta**. Nada que obligue al usuario a configurar o aceptar algo
más adelante.

Leyenda de la columna «Comprobado»:
- **Oficial**: verificado hoy en la documentación o las condiciones oficiales (enlace).
- **Previo**: conocimiento previo, pendiente de comprobar antes de implementar.

## Conclusión

1. **La mayoría de APIs de consumo prohíben el uso comercial gratuito**: Last.fm, Deezer y TMDB. Spotify lo restringe
   tanto (5 usuarios por app) que no sirve.
2. **El camino más sólido es la portabilidad legal.** El art. 6(9) de la DMA obliga a los gatekeepers a dar a terceros
   autorizados acceso **gratuito**, continuo y en tiempo real a los datos del usuario. Google ya está integrado y tiene
   **muchos más grupos útiles en el mismo consentimiento**. Límite: solo cubre la UE (Google: UE, Suiza y Reino Unido).
3. **Fuera de la UE**, las mejores opciones globales con API comercial son Steam (hecho) y Apple Music (MusicKit).
4. Los archivos de exportación RGPD (Spotify, Netflix, Letterboxd, Goodreads…) son legales y globales, pero obligan al
   usuario a pedir el archivo y subirlo después del alta, lo que choca con la regla del consentimiento único. Quedan como
   opción a decidir.

## Orden recomendado de implementación

| # | Fuente | Por qué | Coste | Bloqueos |
|---|---|---|---|---|
| 1 | **Google Data Portability ampliado** | Mismo consentimiento y misma infraestructura. Añade libros, juegos, restaurantes y guardados | 0 € | Solo UE/CH/UK. Los scopes «Restricted» exigen la verificación de Google en producción (ya pendiente para Maps y YouTube) |
| 2 | ~~Apple Music (MusicKit)~~ **descartada mientras sea de pago** | Global; biblioteca, escuchas recientes, rotación frecuente y valoraciones (me encanta / no me gusta) | 99 $/año del Apple Developer Program, necesario igualmente para publicar en iOS | Solo suscriptores de Apple Music. En Android hace falta MusicKit JS (web). Condiciones por verificar |
| 3 | **APIs DMA: TikTok, Meta, Amazon, Apple (App Store)** | Gratuitas por ley; grandes audiencias; likes de páginas, seguidos, compras de libros, apps y juegos | 0 € | UE. Requieren alta y aprobación del desarrollador (identidad de empresa, revisión de seguridad o lista de admitidos). Tarea del titular del proyecto |
| 4 | ~~Twitch~~ **bloqueada** (ver ficha) | — | — | Requiere permiso escrito de Twitch |

## Fichas

### Portabilidad legal (DMA y RGPD)

| Fuente | Datos útiles | Categorías | Veredicto | Comprobado |
|---|---|---|---|---|
| Google · `play.library` | Descargas de Play: **libros, juegos y apps** | books, games | **Viable (siguiente)** | Oficial: [scopes](https://developers.google.com/data-portability/user-guide/scopes) (Sensitive) |
| Google · `myactivity.play` | Actividad en Play | books, games, movies | Viable | Oficial (Restricted) |
| Google · `order_reserve.purchases_reservations` | Pedidos y reservas de comida | food | **Viable** | Oficial (Sensitive) |
| Google · `saved.collections` | Lugares, enlaces y colecciones guardados | food, culture, varias | Viable | Oficial (Sensitive) |
| Google · `discover.likes` / `discover.follows` / `discover.not_interested` | Me gusta, temas seguidos y descartes en Discover | varias (señal débil) | Viable con identificación | Oficial (Sensitive) |
| Google · `youtube.public_playlists` / `private_playlists` | Listas propias | music, podcasts | Viable | Oficial (Sensitive) |
| Google · `myactivity.maps` | Actividad en Maps (búsquedas y visitas) | food, culture | Viable, pero señal implícita | Oficial (Restricted) |
| Google · `search_ugc.media.streaming_video_providers` | Plataformas de streaming declaradas | movies, series (contexto) | Bajo valor | Oficial |
| TikTok Data Portability API | Like List, Favoritos, historial de visionado (enlaces a vídeos), **sonidos favoritos**, hashtags, seguidos | music (sonidos), varias | Viable con trabajo de identificación; requiere solicitud | Oficial: [tipos de datos](https://developers.tiktok.com/doc/data-portability-data-types) |
| Meta Data Portability | La plataforma se registra como **destino** del exportador de Meta (Facebook/Instagram) | varias (páginas que gustan) | Por estudiar: el flujo empieza en Meta, no en la app | Oficial: [guía](https://developers.facebook.com/docs/data-portability) (sin detalle de categorías) |
| Amazon Data Portability | Datos por scopes LWA (pedidos; categorías concretas por confirmar) | books, movies, music | Requiere evaluación de identidad y seguridad y lista de admitidos | Oficial: [overview](https://developer.amazon.com/docs/amazon-data-portability/overview.html) |
| Apple Account Data Transfer | Transacciones y descargas del App Store | games | Requiere solicitud y revisión de Apple | Oficial: [condiciones](https://developer.apple.com/support/account-data-transfer-api-eu/) |
| Booking | Estancias | culture (viajes; bajo valor) | Bajo valor | Oficial (portal DMA) |
| Exportaciones RGPD (Spotify, Netflix, Letterboxd, Goodreads, IMDb) | Historial completo y valoraciones | music, movies, series, books | Legal y global, pero el usuario sube un archivo tras el alta | Previo |

### APIs de plataforma

| Fuente | Categorías | Veredicto | Motivo | Comprobado |
|---|---|---|---|---|
| Steam | games | **Implementada** (fase 2) | Uso comercial permitido; 100.000 llamadas al día | Oficial (fase 2) |
| Apple Music API | music | **Viable** | API comercial pensada para apps. Exige el programa de desarrollador y la suscripción del usuario | Previo |
| Spotify Web API | music, podcasts | **Bloqueada** | Desde 2026, el modo desarrollo admite 5 usuarios por app; la cuota ampliada exige empresa registrada y unos 250.000 usuarios activos al mes | Oficial: [migración feb. 2026](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [anuncio](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security) |
| Last.fm | music | **Bloqueada** | Solo uso no comercial; el comercial requiere acuerdo (partners@last.fm); 100 MB de almacenamiento | Oficial: [ToS](https://www.last.fm/api/tos) |
| Deezer | music, podcasts | **Bloqueada** | «Strictly limited for a non-commercial purpose» | Oficial: [ToS](https://developers.deezer.com/termsofuse) |
| ListenBrainz / MusicBrainz | music | Condicionada | Gratis en modo stealth; con producto público, desde 100 $/mes. Estadísticas por usuario con MBID (sin coste de identificación) | Oficial: [tiers](https://metabrainz.org/supporters/account-type), [stats](https://listenbrainz.readthedocs.io/en/latest/users/api/statistics.html) |
| TMDB (cuenta del usuario) | movies, series | **Bloqueada** | Uso comercial solo con acuerdo escrito; caché ≤ 6 meses | Oficial: [ToS](https://www.themoviedb.org/api-terms-of-use) |
| Open Library (reading log público) | books | **Bloqueada** para producción | No debe usarse como backend de servicios comerciales | Oficial: [API](https://openlibrary.org/developers/api) |
| Trakt | movies, series | Por verificar | OAuth con tokens de 24 h desde 2025; VIP para algunas funciones; condiciones comerciales no confirmadas | Previo/secundaria |
| Twitch | games | **Bloqueada** salvo permiso escrito de Twitch | Acuerdo de desarrolladores (modificado el 04/12/2024, leído el 2026-10-15): no guardar contenido ni datos más de 24 h sin autorización escrita (Schedule 1, C); los insights derivados no pueden monetizarse ni compartirse con terceros sin permiso (VI.C); los usos con permiso del usuario también requieren permiso escrito (VI.B(e)). APPINITY guarda evidencia permanente y recomienda a otras personas | Oficial: [acuerdo](https://legal.twitch.com/en/legal/developer-agreement/) |
| AniList / MyAnimeList | series (anime), books (manga) | Por verificar | Nicho grande; listas con puntuación | Previo (la documentación oficial respondió 403) |
| Discogs | music | Por verificar | Colección y wantlist; nicho de vinilo | Previo (403) |
| Goodreads | books | **Bloqueada** | API cerrada a nuevas claves desde 2020 | Previo |
| Letterboxd | movies | **Bloqueada** | API privada, solo bajo acuerdo | Previo |
| IMDb | movies, series | **Bloqueada** | Sin API de usuario; licencias de datos de pago | Previo |
| Netflix, Prime Video, Disney+, HBO Max | movies, series | **Bloqueadas** | Sin API de usuario (solo exportación RGPD o DMA de Amazon) | Previo |
| Instagram Basic Display | varias | **Bloqueada** | Cerrada en diciembre de 2024 | Previo |
| SoundCloud | music | Bloqueada | Registro de apps restringido | Previo |
| Yelp, TripAdvisor | food | **Bloqueadas** | Sin datos del usuario en la API | Previo |
| Foursquare / Swarm | food, culture | Por verificar | Check-ins por OAuth; la API de lugares es de pago por uso | Previo |
| Untappd | food (cerveza) | Bloqueada | Sin nuevas claves | Previo |
| Eventbrite | culture | Por verificar | Entradas compradas por OAuth | Previo |
| Google Calendar | culture | Descartada por ahora | Scope sensible fuera de Data Portability (otro consentimiento de Google) y señal débil | Previo |
| Xbox / PlayStation / Nintendo | games | Bloqueadas | Sin API pública para terceros (Xbox: solo socios) | Previo |
| Podcast Index | podcasts (catálogo) | Útil como catálogo, no como perfil | API gratuita de catálogo | Previo |
| Pinterest, Reddit | varias | Bloqueadas | Aprobación o acuerdo comercial | Previo |

## Estado (2026-10-14)

- Implementado: Google ampliado (`play.library`, `order_reserve.purchases_reservations` y `saved.collections`), a
  falta de un export real.
- Apple Music: **descartada** mientras exija pago.

## Siguiente paso

Implementar **Google Data Portability ampliado**:
- `play.library`, `order_reserve.purchases_reservations` y `saved.collections`;
- después `myactivity.play` y las listas de YouTube.

Encaje con la arquitectura actual:
- Los grupos se añaden al consentimiento del alta. Google no admite permisos incrementales, así que para las cuentas
  ya conectadas basta un «Renovar permiso».
- Antes de mapear hay que inspeccionar el formato real del export, como en las fases 3 y 4. Para ello se registra la
  estructura de los archivos sin datos personales.

En paralelo, el titular del proyecto puede iniciar las solicitudes DMA (TikTok, Apple, Amazon, Meta). Son trámites de
empresa que no puedo hacer por él.

## Revisión de condiciones oficiales (2026-10-15)

Leídas en sus páginas oficiales; las que bloquean la lectura automática, con el navegador (solo lectura). Trakt muestra
una verificación anti-bots en su página general de condiciones; se usó su política de API en developer.trakt.tv.

| Fuente | Veredicto | Motivo (cláusulas oficiales) |
|---|---|---|
| **Google Books** (estanterías del usuario) | **Viable** | API oficial con OAuth (`https://www.googleapis.com/auth/books`): estanterías «Leídos», «Favoritos», «Reseñados», «Por leer». Puede pedirse en el **mismo consentimiento que «Continuar con Google»** (alta), no en el de Data Portability. Gratuita. [Docs](https://developers.google.com/books/docs/v1/using) |
| **Trakt** (cine y series) | **Viable** (confirmar con Trakt el uso comercial) | [API Use Policy](https://developer.trakt.tv/docs/api-use-policy) (22/09/2026): exige autorización del usuario; permite caché «cuando sirve a las funciones que tus usuarios eligen»; prohíbe vender datos, copiar el catálogo o redistribuirlo. Crear la app requiere una cuenta de GitHub verificada ([Create an App](https://developer.trakt.tv/docs/create-an-app)). Fuentes secundarias de agosto de 2026 hablan de exigir VIP (4,99 $/mes) para crear apps; la documentación oficial no lo dice |
| **AniList** (anime y manga) | **Viable con límite** | [Terms of Use](https://docs.anilist.co/guide/terms-of-use): gratis para uso comercial por debajo de 150 $/mes de ingresos; por encima, licencia. Prohíbe usarla como almacén o copia de seguridad y la recolección masiva |
| Google Calendar (eventos asistidos) | Viable con verificación | Scope sensible: en producción requiere la verificación de Google (gratuita). Señal débil (asistencia) e identificación difícil |
| Discogs | **Bloqueada** | [API Terms](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use): la colección y la lista de deseos son «Restricted Data»: prohibido usarlas con fines comerciales o transferirlas |
| Eventbrite | **Descartada** | [API Terms](https://www.eventbrite.com/help/en-us/articles/833731/eventbrite-api-terms-of-use/) (30/05/2025): prohibido guardar contenido de eventos pasados (3.1), justo la evidencia útil; prohibida la ganancia comercial directa (3.6) |
| SoundCloud | **Bloqueada** | [API Terms](https://developers.soundcloud.com/docs/api/terms-of-use) (30/03/2024): caché solo durante la sesión; registro de apps a discreción de SoundCloud |
| Plex | **Bloqueada** | Sin API oficial para el historial de la cuenta; Plex no revisa ni respalda herramientas de terceros ([developer.plex.tv](https://developer.plex.tv/)) |
| Podchaser | **Descartada** (de pago) | [API](https://www.podchaser.com/api): desde 30 $/mes; solo catálogo, no los gustos del usuario |
| Foursquare / Swarm | Por verificar | API de personalización en beta pública, sujeta a un EULA propio; precio no publicado |
| Twitch | **Bloqueada** | Ver ficha anterior |
| Apple Music | Descartada mientras sea de pago | Decisión del usuario |

### Orden recomendado (gratuito)

1. **Google Books**: va en el consentimiento del alta; casi sin coste de identificación (ISBN e IDs de volumen).
2. **Trakt**: cine y series con valoraciones explícitas; identificación exacta por IMDb/TMDB → Wikidata (P345/P4947).
3. **AniList**: nicho grande de anime y manga; identificación por MyAnimeList o AniList → Wikidata (P4086/P8729).

## Revisión 2026-10-16 · fuentes tipo Trakt, AniList o Steam

Criterio: conocidas en todo el mundo, OAuth o consentimiento del propio usuario, gratis y con uso comercial permitido.

| Fuente | Categorías | Veredicto | Motivo | Fuente consultada |
|---|---|---|---|---|
| Hardcover | books | **Candidata; confirmar por escrito** | OAuth con PKCE, scopes y refresh token (desde agosto de 2026). API GraphQL en beta. No publica condiciones de API: las URL de términos dan 404 | [API](https://docs.hardcover.app/api/getting-started/), [OAuth](https://docs.hardcover.app/api/oauth/) |
| Mixcloud | music, podcasts | **Candidata; revisar condiciones generales** | OAuth con el secreto en el servidor; `/me/` con favoritos, seguidos y escuchas. Las condiciones no mencionan la API | [Developers](https://www.mixcloud.com/developers/) |
| RetroAchievements | games (retro) | Posible, de nicho | Clave de API de la cuenta del desarrollador; perfiles públicos por nombre de usuario. Sin OAuth ni cláusula comercial | [API](https://api-docs.retroachievements.org/) |
| Mixcloud (revisión 2026-10-22) | music, podcasts | **Bloqueada** | Sus condiciones incluyen la API en la «Plataforma» y solo dan una licencia «personal, non-exclusive, non-commercial». También prohíben la recogida automatizada de datos | [Terms](https://www.mixcloud.com/terms/) |
| Kitsu | series, books | Por confirmar | Las condiciones no mencionan la API; una fuente secundaria antigua dice «no comercial» | — |
| Simkl | movies, series, anime | **Bloqueada** sin licencia | «Free-for-non-commercial»; el uso comercial requiere licencia | [api.simkl.org](https://api.simkl.org/) |
| MyAnimeList | series, books | **Bloqueada** | Prohíbe guardar datos de usuario en el servidor; uso comercial solo con autorización escrita | [API License](https://myanimelist.net/static/apiagreement.html) |
| setlist.fm | culture (conciertos) | **Bloqueada** | «Only free for non-commercial projects» | [API](https://api.setlist.fm/docs/1.0/index.html) |
| TIDAL | music | **Bloqueada** | Developer Terms 1.0: solo ofertas no comerciales | [Developer Terms](https://developer.tidal.com/documentation/guidelines-developer-terms-1_0) |
| BoardGameGeek | culture (juegos de mesa) | **Bloqueada** | Licencia «strictly non-commercial»; la comercial se negocia caso a caso | [XML API](https://boardgamegeek.com/using_the_xml_api) |

Conclusión: las grandes plataformas de consumo exigen licencia comercial. Lo integrable gratis sigue siendo:

- Google, con un solo consentimiento;
- Steam, Trakt y AniList (ya integradas);
- Hardcover y Mixcloud, si se confirman sus condiciones.
