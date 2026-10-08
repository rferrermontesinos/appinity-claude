# Fuentes de datos de usuario · revisión del 2026-10-08

Revisión de las plataformas de las que APPINITY podría obtener los gustos de una persona. Parte de la lista de la
especificación inicial, de las propuestas del usuario y de otras con API accesible. Se descartó TMDb tras implementarla
(fase 3, PR rferrermontesinos/appinity-claude#4 cerrada sin fusionar): sus condiciones solo permiten uso gratuito no
comercial. Esta revisión aplica ese mismo filtro a todas las demás.

Las conclusiones se basan en la documentación y las condiciones públicas consultadas en esa fecha (enlaces al final).
Donde la fuente era secundaria o incompleta se indica **«por confirmar»**. Ninguna fila sustituye a la ficha completa
que se redacta antes de implementar cada fuente (§9 de la especificación).

## Criterios

1. **Un solo consentimiento, en el registro.** El usuario autoriza con el flujo oficial del proveedor (OAuth, OpenID o
   permiso nativo del sistema). Nunca introduce tokens, claves, códigos, nombres de usuario ni archivos.
2. **API oficial y documentada.** Sin scraping, APIs privadas ni ingeniería inversa.
3. **Condiciones compatibles con una app comercial** (APPINITY tendrá Premium), sin acuerdo previo; o con el acuerdo
   identificado.
4. **Señales útiles** para Known, Consumed y Preference.
5. **Disponible en España**, el mercado inicial.

## Veredictos

| Código | Significado |
|---|---|
| **A** | Implementable: cumple los cinco criterios. Puede exigir la verificación estándar de la app ante el proveedor |
| **B** | Implementable con requisitos: auditoría de seguridad, programa de desarrollador de pago, aprobación del proveedor o puntos por confirmar antes de desarrollar |
| **C** | Requiere acuerdo: la API existe, pero el uso comercial o el acceso exigen contrato, partnership o una escala mínima |
| **D** | No viable: sin API de usuario, solo exportación manual, scraping, o el usuario tendría que introducir un token |

## Resumen

- **Google Data Portability es el eje.** Con una sola autorización de Google llegan:
  - valoraciones explícitas de películas, series, libros, música y videojuegos hechas en la Búsqueda y Google TV;
  - reseñas con estrellas y sitios guardados de Maps;
  - la actividad de YouTube y YouTube Music;
  - instalaciones y compras de Google Play;
  - reservas hechas con Google.

  Cubre las ocho categorías y está disponible en España. Exige verificación de Google y cumplir su política; ver
  [Agregadores](#agregadores-transversales).
- **Las grandes plataformas de contenido no tienen API de usuario**: Netflix, Disney+, Prime Video, Movistar+, Filmin,
  Xbox, PlayStation, Nintendo, Epic, Glovo, Just Eat, Apple Podcasts, Podimo, Kindle, Audible. TheFork y DICE solo dan
  acceso a sus socios comerciales.
- **Bloqueadas por condiciones comerciales o escala**:
  - TMDb y Last.fm: el uso comercial requiere acuerdo.
  - Spotify: desde el 15/05/2025 el acceso ampliado es solo para empresas con ≥ 250.000 usuarios activos al mes; en
    desarrollo admite 5 usuarios.
  - Letterboxd: no concede acceso a proyectos de recomendación.
- **Gmail** daría acceso a pedidos de comida, reservas, entradas y compras de juegos de consola, pero es un permiso
  restringido: exige auditoría anual de seguridad y encajar en los usos que Google permite. Queda en evaluación, fuera
  del MVP.
- **Podcasts es la categoría más débil**: solo YouTube y YouTube Music aportan datos. Libros depende de Google (Books
  y Búsqueda).

## Agregadores transversales

### Google Data Portability API · veredicto **B** · prioridad P0

Un consentimiento de Google (OAuth) con los grupos de recursos elegidos. Los datos llegan como un archivo que la API
prepara de forma asíncrona.

| Grupo de recursos | Datos | Categorías |
|---|---|---|
| `search_ugc.media.reviews_and_stars` | Reseñas y estrellas dadas en la Búsqueda a películas, libros, series, música y videojuegos | movies, series, books, music, games |
| `search_ugc.media.thumbs` | Pulgar arriba/abajo en la Búsqueda y Google TV a esos mismos tipos | movies, series, books, music, games |
| `search_ugc.media.watched` | Películas y series marcadas como vistas | movies, series |
| `maps.reviews` | Reseñas de Maps con estrellas 1–5, texto, lugar (nombre, dirección, país, coordenadas) y fecha | food, culture |
| `maps.starred_places` | Sitios destacados (nombre, dirección, coordenadas, fecha) | food, culture |
| `saved.collections` | Elementos guardados en colecciones de la Búsqueda y Maps (título, URL, nota) | todas |
| `myactivity.youtube` | Actividad de YouTube (incluye YouTube Music): qué se vio o escuchó y cuándo | music, podcasts, (movies, games) |
| `youtube.music` | Biblioteca de YouTube Music | music |
| `youtube.subscriptions` | Canales suscritos (artistas, programas) | music, podcasts |
| `play.installs`, `play.purchases`, `play.library` | Apps y juegos instalados y comprados; películas y música compradas | games, movies |
| `order_reserve.purchases_reservations` | Pedidos y reservas hechos con Google (Order/Reserve with Google): comercio, artículos, fechas | food, culture |
| `myactivity.maps`, `myactivity.play`, `myactivity.search` | Actividad en Maps, Play y Búsqueda | señales débiles, solo si aportan |

Condiciones verificadas:

- **Países:** los 27 de la UE, Suiza y Reino Unido (incluye España). No admite menores de 18 años.
- **Acceso:** una sola exportación o acceso temporal de 30 o 180 días, con exportaciones cada 24 h como máximo. Los
  filtros de tiempo (solo lo nuevo) funcionan en My Activity y Play. Al caducar, **el usuario debe renovar** el acceso
  (Google ofrece la renovación en los últimos 90 días).
- **Verificación:** la app pasa la verificación de Google y se reverifica cada año. Los scopes restringidos exigen además
  una auditoría de seguridad (CASA) con un evaluador autorizado. Precio orientativo según proveedores: de 540 a
  4.500 USD al año. Pendiente: comprobar en la consola qué grupos son restringidos.
- **Política:** el caso de uso aprobado es una app cuya función principal es **trasladar o copiar** datos de Google a
  otra plataforma, y su uso se limita a funciones visibles para el usuario. **Por confirmar en la verificación** que
  importar el historial cultural para construir el perfil de gustos encaja en ese caso de uso.
- **Desarrollo:** el proyecto de Google Cloud en modo de pruebas admite usuarios de prueba sin verificación.

**Choque con el criterio 1:** la renovación periódica (cada 180 días como máximo) obliga a pedir de nuevo el permiso.
Se propone un aviso con un toque y que el perfil importado se conserve si el usuario no renueva.

### Gmail API · veredicto **B** (alto riesgo) · fuera del MVP

- **Qué permitiría ver:** confirmaciones de pedidos (Glovo, Uber Eats, Just Eat), reservas (TheFork), entradas (DICE,
  Resident Advisor, Ticketmaster, Eventbrite) y compras de juegos (PlayStation Store, Nintendo eShop, Epic, Xbox).
  Es la única vía para las fuentes sin API.
- **Permiso restringido:** `gmail.readonly` (incluso `gmail.metadata`) es restringido. Exige verificación y una
  auditoría CASA anual si los datos pasan por el servidor.
- **Usos permitidos:** Google admite clientes de correo, copias de seguridad, productividad y «informes o seguimiento
  que benefician al usuario» (itinerarios, seguimiento de paquetes). Prohíbe anuncios, venta y transferencias.
- **Por confirmar:** si Google acepta usar datos derivados del correo para calcular afinidades con otras personas.
- **Coste para el usuario:** es el permiso más invasivo para él.

Se propone evaluarlo aparte (legal y coste), con extracción en el servidor limitada a una lista blanca de remitentes.

### Calendario · veredicto **A**

- **Calendario del dispositivo:** permiso nativo (`READ_CALENDAR`, EventKit) sin revisión de Google. El filtrado se hace
  en el teléfono, como ya dice §14.
- **Google Calendar API:** `calendar.events.readonly` es un scope sensible: necesita verificación de la app, pero no
  CASA.
- **Señal:** eventos previstos con incertidumbre (§5). No crean preferencia.

### Inicio de sesión con Google o Apple

Solo identifica a la persona (onboarding §14). No aporta gustos. El consentimiento de Data Portability puede pedirse en
el mismo registro como autorización incremental.

## Por categoría

### food · Restaurantes

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| Google Maps · reseñas | Estrellas 1–5 con fecha y lugar | Data Portability (`maps.reviews`) | **B** |
| Google Maps · guardados | Sitios destacados y colecciones | Data Portability (`maps.starred_places`, `saved.collections`) | **B** |
| Reservas y pedidos con Google | Reservas de mesa y pedidos (comercio, fecha) | Data Portability (`order_reserve…`) | **B** |
| Calendario | Citas en restaurantes | Permiso nativo / Google Calendar | **A** |
| Foursquare Swarm | Check-ins (visitas con fecha) | OAuth. Hay indicios de que sigue activo (2026, 10.000 llamadas gratis al mes); condiciones comerciales por confirmar | **B** |
| Uber Eats | Pedidos anteriores de una cuenta vinculada | Consumer Delivery API en acceso anticipado y «puede requerir aprobación escrita» | **C** |
| TheFork | — | Solo API B2B para restaurantes y socios | **C** |
| Gmail | Pedidos de Glovo, Uber Eats, Just Eat y reservas de TheFork | Ver Agregadores | **B** (fuera del MVP) |
| Glovo | — | Solo API de socios (POS) | **D** |
| Just Eat | — | API de partners; el ejemplo de pedidos de consumidor es de 2021 y no consta abierto | **D** |
| Tripadvisor | — | Content API sin datos del miembro; prohíbe guardar contenido salvo el ID del lugar | **D** |
| Untappd | Check-ins de cerveza | No acepta nuevas aplicaciones (2024) | **D** |

### movies · Películas

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| Google Búsqueda y Google TV | Estrellas, pulgares y «visto» | Data Portability (`search_ugc.media.*`) | **B** |
| Google Play / Google TV | Películas compradas | Data Portability (`play.purchases`, `play.library`) | **B** |
| YouTube | Visionados (tráileres, películas alquiladas) | Data Portability (`myactivity.youtube`); señal débil | **B** |
| Trakt | Historial, valoraciones y listas | API gratuita con OAuth. La comercial no consta, y Trakt declara oponerse a revender datos de su comunidad: confirmar por escrito | **C** |
| TMDb | Valoraciones, favoritos y pendientes | Uso comercial con acuerdo escrito. Implementado y descartado | **C** |
| Letterboxd | Diario y valoraciones | API solo por solicitud; no concede acceso a proyectos de recomendación | **D** |
| Simkl | Historial y valoraciones | Condiciones no encontradas; fuentes secundarias apuntan a acceso solo VIP | **C** (por confirmar) |
| Plex | Historial de su servidor | Exige al usuario introducir un código en plex.tv/link; condiciones restrictivas | **D** |
| Netflix | — | Retiró el historial de su API en 2012 y cerró el programa | **D** |
| Disney+, Prime Video, Movistar+, Filmin | — | Sin programa público de desarrolladores encontrado | **D** |
| Stremio | — | SDK solo para add-ons de contenido; el historial se sincroniza con Trakt o con APIs no oficiales | **D** (vía Trakt) |
| Filmaffinity | — | Sin API; solo descarga manual de datos | **D** |

### series · Series

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| Google Búsqueda y Google TV | Estrellas, pulgares y «visto» en series | Data Portability (`search_ugc.media.*`) | **B** |
| YouTube | Visionados | Data Portability; señal débil | **B** |
| Trakt | Episodios vistos, valoraciones | Como en películas | **C** |
| TVmaze | Seguidas, votos y vistos | La API de usuario exige Premium y que cada usuario introduzca su clave (sin OAuth) | **D** |
| Simkl | Historial | Como en películas | **C** (por confirmar) |
| Netflix, Disney+, Prime Video, Movistar+, Filmin | — | Sin API | **D** |

### music · Música (artistas)

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| YouTube Music y YouTube | Escuchas con fecha, biblioteca, artistas suscritos | Data Portability (`myactivity.youtube`, `youtube.music`, `youtube.subscriptions`) | **B** |
| Google Búsqueda | Estrellas y pulgares a música | Data Portability (`search_ugc.media.*`) | **B** |
| Apple Music | Biblioteca, escuchas recientes, heavy rotation, valoraciones | MusicKit: autorización única en iOS y Android. Requiere Apple Developer Program; condiciones de MusicKit por confirmar | **B** |
| SoundCloud | Likes y cuentas seguidas | OAuth 2.1 con PKCE; registrar la app exige una suscripción Artist Pro del desarrollador | **B** |
| Deezer | Historial y favoritos | OAuth; por confirmar que admita altas de nuevas apps | **B** (por confirmar) |
| TIDAL | Colección y favoritos | OAuth (PKCE) en su plataforma de desarrolladores; condiciones comerciales no encontradas | **B** (por confirmar) |
| Discogs | Colección y wantlist | OAuth 1.0a. Datos de usuario «restringidos» según sus condiciones (actualizadas el 27/05/2025): revisar | **B** (por confirmar) |
| ListenBrainz | Escuchas (pueden venir de Spotify) | Datos CC0 con uso comercial permitido. Se leen por nombre de usuario: haría falta obtenerlo con el inicio de sesión de MusicBrainz (OAuth), sin que lo escriba el usuario | **B** (nicho) |
| Last.fm | Scrobbles, artistas, loved tracks | Licencia no comercial; lo comercial se negocia con partners@last.fm (posible reparto de ingresos) | **C** |
| Spotify | Top artistas, escuchas recientes, biblioteca | Modo desarrollo: 5 usuarios. Acceso ampliado solo para empresas con ≥ 250.000 usuarios activos al mes (desde el 15/05/2025) | **C** (por escala) |
| Bandsintown | — | API solo de artista; sin datos del fan | **D** |
| Songkick | — | Comprado por Suno en 2025; cierre anunciado | **D** |

### games · Videojuegos

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| Steam | Biblioteca y horas | OpenID + Web API (implementado, validado con cuenta real) | **A** ✔ |
| Google Play | Juegos instalados y comprados | Data Portability (`play.*`); instalado ≠ jugado | **B** |
| Google Búsqueda | Estrellas y pulgares a videojuegos | Data Portability (`search_ugc.media.*`) | **B** |
| itch.io | Juegos comprados o reclamados | OAuth con scope `profile:owned`; condiciones comerciales por confirmar | **B** |
| Battle.net | Perfiles de WoW, StarCraft II y Diablo III | OAuth; datos por juego. El uso comercial no está claro en foros: confirmar | **B** (limitado) |
| Riot (LoL, VALORANT) | Historial de partidas | Riot Sign On solo con clave de producción aprobada; datos por juego | **C** |
| Gmail | Compras en PlayStation Store, eShop, Epic, Xbox | Ver Agregadores | **B** (fuera del MVP) |
| Xbox | — | Sin acceso oficial para terceros (programas solo para juegos: Creators, ID@Xbox) | **D** |
| PlayStation | — | Solo APIs no oficiales con token NPSSO | **D** |
| Nintendo | — | Solo APIs no oficiales con token de sesión | **D** |
| Epic Games | — | Epic Account Services: perfil, amigos y presencia; sin biblioteca ni horas | **D** |
| GOG | — | SDK solo para estudios; la API de biblioteca no es oficial | **D** |
| Discord | — | `activities.read` (jugando y escuchando ahora) no está disponible para apps; `connections` solo lista cuentas vinculadas, sin actividad | **D** |

### books · Libros

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| Google Books | Estanterías: favoritos, comprados, por leer, leyendo, leídos, reseñados | API oficial, OAuth con scope `books` (probablemente sensible: verificación) | **A** |
| Google Búsqueda | Estrellas y pulgares a libros | Data Portability (`search_ugc.media.*`) | **B** |
| Google Play Libros | Compras | Data Portability (`play.purchases`): por confirmar que incluya libros | **B** (por confirmar) |
| Goodreads | — | No emite claves desde diciembre de 2020 | **D** |
| StoryGraph | — | Sin API pública (petición abierta desde 2021) | **D** |
| Hardcover | Estanterías y valoraciones | Solo tokens personales; los proyectos comerciales solo pueden usar datos propios | **D** |
| Kindle, Audible, Kobo | — | Sin API pública de usuario | **D** |
| Gmail | Compras de libros | Ver Agregadores | **B** (fuera del MVP) |

### culture · Cultura (eventos y lugares)

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| Google Maps · reseñas y guardados | Museos, teatros y salas valorados o guardados | Data Portability | **B** |
| Calendario | Eventos previstos | Permiso nativo / Google Calendar | **A** |
| Reservas con Google | Reservas de actividades | Data Portability (`order_reserve…`) | **B** |
| Eventbrite | Pedidos de entradas del usuario | OAuth; existe `GET /users/{id}/orders/`. Por confirmar con una cuenta de asistente | **B** |
| Meetup | Asistencias confirmadas (RSVP) | OAuth en GraphQL; crear el cliente OAuth exige una suscripción Meetup Pro del desarrollador | **B** |
| Gmail | Entradas de DICE, RA, Ticketmaster, Fever, Eventbrite | Ver Agregadores | **B** (fuera del MVP) |
| DICE | — | API de titulares de entradas solo para promotores socios | **C** |
| Resident Advisor | — | API de eventos solo para socios (p. ej. SoundCloud); sin API pública | **C** |
| Ticketmaster | — | Discovery API solo de catálogo; los pedidos solo para socios | **D** (usuario) |
| Songkick, Bandsintown | — | Ver música | **D** |
| Kultur | — | No se ha podido identificar una app con ese nombre (la más parecida es Kulturklik, agenda del Gobierno Vasco, sin datos de usuario) | — |

### podcasts · Podcasts (programas)

| Fuente | Datos de usuario | Acceso y condiciones | Veredicto |
|---|---|---|---|
| YouTube y YouTube Music | Episodios escuchados, canales suscritos | Data Portability; hay que separar podcasts de vídeos | **B** |
| Spotify | Programas guardados | Como en música | **C** (por escala) |
| Podchaser | Valoraciones (de su comunidad) | API por puntos: gratis hasta 25.000 al mes; planes comerciales con precio a consultar; OAuth sin detallar | **C** |
| Apple Podcasts | — | Sin API pública de biblioteca para terceros | **D** |
| Podimo | — | Sin API pública | **D** |
| iVoox | — | Solo librerías no oficiales | **D** |
| Pódium (PRISA) | — | Distribuye por RSS y plataformas (Spotify, Podimo…); sin API de oyente | **D** |
| Google Podcasts | — | Cerrado en 2024 | **D** |

**Cobertura resultante:** podcasts depende casi por completo de YouTube. Mientras tanto se aplica la regla de §3: sin
evidencia propia en una categoría, se recomienda mediante las almas gemelas de otras categorías y la afinidad de esa
categoría es NULL.

## Proveedores de catálogo con licencia compatible

La misma regla rige para el catálogo: título, descripción e imagen deben poder usarse comercialmente y almacenarse.

| Proveedor | Licencia y condiciones | Uso propuesto |
|---|---|---|
| Wikidata | CC0, sin restricciones | Base de todas las categorías y puente de identificadores (IMDb, Freebase, Knowledge Graph de Google, Steam, MusicBrainz, Apple Podcasts…) |
| Wikimedia Commons | Licencia por archivo (libres, con autor) | Imágenes libres. La mayoría de pósters de cine no tienen versión libre: se usa el fallback |
| MusicBrainz | Núcleo CC0; datos suplementarios CC BY-NC-SA | Artistas, solo el núcleo |
| TVmaze | CC BY-SA 4.0; uso comercial con crédito (respuesta de su equipo); imágenes por enlace | Series |
| Podcast Index | Índice gratuito «para cualquier uso» según fuentes secundarias | Podcasts (por confirmar) |
| Steam (tienda) | Arte solo como referencia | Videojuegos (ya en uso) |
| Agendas culturales de datos abiertos (datos.gob.es, catálogos autonómicos) | Licencia de cada catálogo (por revisar) | Eventos y lugares culturales (catálogo, no perfil) |
| TMDb | Comercial con acuerdo | Descartado |
| IMDb datasets | Solo no comercial | Descartado |
| IGDB | Comercial mediante partnership | Pendiente de acuerdo |
| OMDb | Condiciones comerciales no publicadas | No usar sin confirmación escrita |

Consecuencia: sin un acuerdo comercial (TMDb, IGDB u otro), películas y series tendrán metadatos de Wikidata y TVmaze, y
muchas tarjetas mostrarán la imagen de sustitución. Es una decisión de negocio pendiente.

## Acuerdos comerciales a solicitar (tarea del negocio, no de código)

Spotify (al alcanzar escala), Last.fm, TMDb o un catálogo audiovisual con licencia, Trakt, IGDB, Uber Eats, TheFork,
DICE, Resident Advisor y Podchaser. Cada uno pasaría a **A/B** solo con el acuerdo firmado.

## No verificado en esta revisión

- Clasificación exacta (sensible o restringido) de cada grupo de Data Portability y del scope `books`.
- Escala de las estrellas de `search_ugc.media.reviews_and_stars` y si incluye fecha. Ambas se comprobarán con un export
  real; condicionan Trending.
- Que el uso de APPINITY encaje en el caso de uso aprobado de Data Portability y en los usos permitidos de Gmail.
- Condiciones comerciales de Apple MusicKit, SoundCloud, Deezer, TIDAL, Discogs, itch.io, Foursquare, Eventbrite,
  Battle.net y Podcast Index.

## Fuentes consultadas (2026-10-08)

- Google Data Portability: [introducción](https://developers.google.com/data-portability/user-guide/overview),
  [esquemas](https://developers.google.com/data-portability/schema-reference),
  [Search contributions](https://developers.google.com/data-portability/schema-reference/search_ugc),
  [Maps (Your Places)](https://developers.google.com/data-portability/schema-reference/local_actions),
  [My Activity](https://developers.google.com/data-portability/schema-reference/my_activity),
  [YouTube](https://developers.google.com/data-portability/schema-reference/youtube),
  [Play](https://developers.google.com/data-portability/schema-reference/play),
  [My Orders](https://developers.google.com/data-portability/schema-reference/my_orders),
  [Saved](https://developers.google.com/data-portability/schema-reference/save),
  [política](https://developers.google.com/data-portability/policy),
  [acceso temporal](https://developers.google.com/data-portability/user-guide/time-based),
  [países](https://support.google.com/accounts/answer/14452558)
- Google: [scopes restringidos](https://support.google.com/cloud/answer/13464325),
  [verificación de scopes restringidos](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification),
  [política de datos de las APIs](https://developers.google.com/terms/api-services-user-data-policy),
  [política de Workspace/Gmail](https://developers.google.com/gmail/api/policy),
  [Books API](https://developers.google.com/books/docs/v1/using),
  [YouTube API Services](https://developers.google.com/youtube/terms/developer-policies)
- Spotify: [modos de cuota](https://developer.spotify.com/documentation/web-api/concepts/quota-modes),
  [criterios de acceso ampliado](https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access)
- Last.fm: [API Terms of Service](https://www.last.fm/api/tos)
- Letterboxd: [API Access](https://letterboxd.com/api-beta/)
- Netflix: [Benton (2012)](https://benton.org/headlines/netflix-users-developers-we-own-your-viewing-history),
  [T3](https://www.t3.com/news/netflix-announces-the-end-of-its-public-api-program)
- Xbox: [titlehistory](https://devdocs.xbox.com/reference/live/rest/uri/titlehistory/atoc-reference-titlehistoryv2)
- Epic: [amigos y estado](https://onlineservices.epicgames.com/news/querying-for-epic-friends-and-their-status)
- itch.io: [OAuth](https://itch.io/docs/api/oauth)
- Riot: [Developer API Policy](https://support-developer.riotgames.com/hc/en-us/articles/22698735834515)
- IGDB: [uso comercial](https://discuss.dev.twitch.com/t/commercial-use-of-igdb-api/23567)
- Apple Music: [autenticación de usuario](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit),
  [MusicKit](https://developer.apple.com/musickit)
- SoundCloud: [registro de apps](https://developers.soundcloud.com/docs/api/register-app)
- Discogs: [API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593)
- TVmaze: [uso comercial](https://www.tvmaze.com/threads/6552/using-posters-and-data-from-tvmaze-api-on-a-commercial-website)
- IMDb: [datasets no comerciales](https://developer.imdb.com/non-commercial-datasets)
- Wikidata: [licencia](https://www.wikidata.org/wiki/Wikidata:Licensing)
- Goodreads: [fin de la API](https://www.goodreads.com/topic/show/21788520-api-deprecation)
- StoryGraph: [petición de API](https://roadmap.thestorygraph.com/features/posts/an-api)
- Hardcover: [API](https://docs.hardcover.app/api/getting-started)
- Podchaser: [precios (Rephonic)](https://rephonic.com/blog/podchaser-api/)
- Eventbrite: [autenticación](https://www.eventbrite.co/platform/docs/authentication)
- Meetup: [OAuth y Pro](https://help.meetup.com/hc/en-us/articles/41453576628749)
- DICE: [Ticket Holder API](https://dice.fm/blog/dices-big-fat-2021-product-round-up)
- Resident Advisor: [acuerdo con SoundCloud](https://press.soundcloud.com/239353-resident-advisor-and-soundcloud-announce-strategic-partnership-to-expand-artist-and-fan-conne)
- Ticketmaster: [condiciones](https://developer.ticketmaster.com/support/terms-of-use/)
- Songkick: [cierre](https://www.hypebot.com/songkick-to-shutter-in-november/)
- Uber: [Consumer Delivery](https://developer.uber.com/docs/consumer-delivery/introduction)
- Tripadvisor: [política de caché](https://tripadvisor-content-api.readme.io/reference/caching-policy)
- Untappd: [API Terms](https://untappd.com/terms/api)
- Foursquare: [blog de Terence Eden (2026)](https://shkspr.mobi/blog/?p=68230)
- Trakt: [requisitos de marca (archivo)](https://web-archive.nli.org.il/National_Library/mp_/https://trakt.tv/branding)
- Stremio: [SDK de add-ons](https://npmjs.com/package/stremio-addon-sdk)
- Discord: [OAuth2 scopes](https://docs.discord.com/developers/topics/oauth2)
- Pódium: [PRISA Audio y Podimo](https://www.insideradio.com/podcastnewsdaily/prisa-media-and-podimo-join-forces-to-take-a-bigger-share-of-global-spanish-podcast/article_d155487c-a936-11ec-9f30-eb8def04cf4a.html)
