# APPINITY
## Especificación del MVP · implementación independiente con Claude

Versión 1.0 · 5 de octubre de 2026 · Documento de trabajo para una IA de programación

**Concepto central:** Descubre recomendaciones de tus almas gemelas y conoce a las personas que comparten tus gustos.

Este documento define el producto, el modelo de datos, la arquitectura y la secuencia para construir APPINITY. Se acompaña de un prompt maestro para que Claude construya una implementación desde cero en un repositorio independiente. El resultado esperado es una aplicación móvil funcional y un backend comprobable, desarrollados por etapas.

Los requisitos de producto se distinguen de las propuestas técnicas. Los umbrales y fórmulas identificados como propuestas son parámetros iniciales de implementación, sujetos a validación; no son decisiones comerciales adicionales. La disponibilidad de datos de cada plataforma debe comprobarse antes de activar una integración real. Ninguna lista de datos deseados debe interpretarse como una garantía de que su API los proporciona.

## 1 Concepto y alcance

APPINITY construye un perfil cultural a partir de actividad importada de cuentas externas, encuentra personas con gustos compatibles y recomienda contenidos apoyados por esas personas. Permite descubrir recomendaciones y conocer a las personas que comparten los gustos del usuario.

**Regla esencial:** las acciones dentro de APPINITY no construyen ni modifican el perfil cultural. Descartar, conservar, abrir enlaces, ver perfiles, hablar con alguien o aceptar una amistad no representa una valoración. Las preferencias proceden exclusivamente de fuentes externas conectadas y consentidas.

El MVP cubre ocho categorías. Todas tienen un icono, un color propio, recomendaciones y afinidad por categoría. La interpretación de actividad puede variar entre categorías, pero trabaja sobre un modelo normalizado común.

| Código | Categoría | Objeto recomendado | Alcance del contenido |
|---|---|---|---|
| food | Restaurantes | Restaurante | Local |
| movies | Películas | Película | Global |
| series | Series | Serie o temporada | Global |
| music | Música | Artista | Global |
| games | Videojuegos | Videojuego | Global |
| books | Libros | Libro | Global |
| culture | Cultura | Evento o lugar cultural | Local |
| podcasts | Podcasts | Podcast o programa | Global |

Cada objeto del catálogo almacena una imagen principal o una referencia persistente a ella, sus metadatos y sus enlaces externos. La imagen se utiliza en el carrusel de recomendaciones. Si no existe una imagen utilizable, se muestra una imagen de sustitución de la categoría, sin fabricar una fotografía del contenido.

No entran en el MVP: publicaciones, stories, comentarios públicos, feed social, reviews o ratings internos, grupos, badges, gamificación, perfil de gustos detallado, banca abierta, seguimiento GPS permanente, IA conversacional ni creación manual de listas.

## 2 Navegación y experiencia móvil

Se mantienen cuatro pestañas principales: **Home, Categories, People y Profile**. La ubicación de Soulmates y Friends dentro de People, y de ajustes dentro de Profile, es una propuesta de organización que completa la navegación de cuatro pestañas.

| Pestaña | Contenido |
|---|---|
| Home | Carrusel de recomendaciones de las ocho categorías |
| Categories | Acceso a las ocho categorías y recomendaciones filtradas |
| People | Almas gemelas, amigos, perfil mínimo y acceso a mensajería |
| Profile | Fuentes conectadas, ubicación, radio, notificaciones, privacidad y suscripción |

Home muestra una tarjeta principal grande, las siguientes tarjetas del stack y tres controles accesibles: descartar, deshacer y conservar. Los gestos tienen equivalentes mediante botones. El diseño es propio y prioriza la imagen del objeto, el título, la categoría y el motivo de recomendación.

Cada tarjeta contiene: imagen, título, icono y color de categoría, indicador NEW si es la primera impresión, motivo verificable y enlace externo. La fuente externa se representa mediante un icono discreto, con etiqueta accesible. El texto de atribución exigido por el proveedor puede aparecer en el detalle o en el lugar que exijan sus condiciones.

Ejemplos de textos breves: «17 de tus almas gemelas la valoraron muy bien», «Descubierto a través de Laura» y «Muy bien valorado en tu zona». Un porcentaje «Para ti» solo se presenta si existe una puntuación de recomendación definida y calibrada. No se inventan porcentajes ni se confunden con la afinidad entre personas.

| Acción | Resultado | Efecto en los gustos |
|---|---|---|
| Swipe izquierda o descartar | Desaparece inmediatamente y no reaparece en Home mientras se conserve el descarte | Ninguno |
| Swipe derecha o conservar | Pasa a la siguiente tarjeta y puede reaparecer en una sesión futura | Ninguno |
| Deshacer | Revierte la última acción de descarte o conservación y recupera la tarjeta | Ninguno |
| Abrir enlace | Abre el recurso externo correspondiente | Ninguno |

El descarte se conserva por usuario y objeto canónico, no únicamente por sesión. Deshacer revierte el estado creado por la última acción; no elimina el historial de impresiones. Conservar no crea una lista personal, porque esa funcionalidad está fuera del MVP. Dentro de una sesión se evita repetir tarjetas conservadas.

NEW significa que APPINITY nunca había mostrado ese objeto al usuario. No significa estreno reciente. Se registra la impresión al mostrar efectivamente la tarjeta, no al precargarla. Los enlaces e imágenes deben tolerar errores de carga.

La frase «Una de las personas con mayor afinidad contigo ha valorado esto muy positivamente y no tenemos constancia de que tú lo conozcas» es únicamente una explicación conceptual para el desarrollador. No es un texto obligatorio de interfaz. La UI emplea mensajes breves derivados de evidencia real.

## 3 Categorías y ubicación

Categories presenta las ocho categorías y utiliza el mismo lenguaje de tarjetas o ranking que Home, limitado a la categoría seleccionada. Los objetos descartados en Home pueden aparecer aquí. Se propone conservar el filtro de conocidos también en Categories; el descarte de Home nunca actúa como filtro en esa pestaña.

Si no hay evidencia propia en una categoría, se generan recomendaciones mediante las almas gemelas obtenidas en otras categorías, los patrones agregados disponibles y las tendencias válidas. La afinidad de esa categoría se representa como NULL, visible como «—». La falta de datos nunca equivale a un 0 % de afinidad.

El radio por defecto es 10 km, configurable entre 1 y 50 km. Es obligatorio filtrar restaurantes, eventos, museos y lugares culturales por su distancia a la ubicación seleccionada. Películas, series, artistas, videojuegos, libros y podcasts no se limitan por la ubicación del objeto.

Se propone permitir ubicación manual además del permiso puntual del dispositivo. Se almacena una zona aproximada y una zona horaria; no se necesita un historial GPS. Los cálculos de distancia se realizan en metros con PostGIS, sin aplicar distancias en grados a coordenadas EPSG:4326.

La ubicación tiene un segundo uso específico: delimitar la comunidad de usuarios que aporta votos a Trending, incluso para contenidos globales. La ubicación del contenido y la ubicación de las personas que lo valoran son filtros distintos.

## 4 Almas gemelas y amigos

APPINITY considera a todos los usuarios elegibles de la plataforma y mantiene un ranking de afinidad direccional. La versión gratuita muestra inicialmente las Top 50 almas gemelas disponibles. Si solo hay 12 candidatos válidos, se muestran 12; no se inventan otros 38.

Usuarios elegibles: cuentas activas, adultas según el onboarding, con evidencia suficiente y disponibles para esta función conforme a los ajustes de privacidad. Se excluyen el propio usuario y las relaciones bloqueadas en cualquier dirección. La implementación debe documentar los mínimos de evidencia.

Cada fila muestra foto, nombre o username, país y afinidad global. Al abrir un perfil se muestra la afinidad global y las ocho afinidades por categoría. El perfil no revela historiales completos, restaurantes visitados, películas vistas ni listas culturales. Una recomendación atribuida a una persona solo revela el objeto y el motivo permitido para esa recomendación.

La afinidad es direccional. Laura → Ricard y Ricard → Laura pueden diferir porque la cobertura depende del historial de la persona de origen. Si ambas direcciones tienen una afinidad de al menos 90 %, se muestra «Afinidad mutua excepcional». El indicador debe ser poco frecuente por la calidad y cantidad de evidencia exigidas, sin alterar artificialmente los resultados para crear o suprimir coincidencias.

Los amigos proceden de contactos, de relaciones creadas en APPINITY y de futuras integraciones sociales. No tienen que ser almas gemelas. Se muestran con el mismo perfil mínimo y pueden tener una afinidad baja o desconocida. El usuario puede desactivar «Permitir que mis contactos me encuentren».

Propuesta para relaciones internas: solicitud y aceptación, con estados pending, accepted y rejected. Los contactos requieren permiso separado; no deben subir una agenda completa sin necesidad. El procedimiento de matching debe diseñarse considerando que el simple hash de un teléfono no garantiza su anonimato.

## 5 Separación de conocimiento consumo y preferencia

El modelo conserva tres dimensiones independientes desde el primer día:

| Dimensión | Pregunta | Valor |
|---|---|---|
| Known | ¿Hay evidencia de que conoce el objeto? | Confianza de 0 a 1 |
| Consumed | ¿Hay evidencia de que lo consumió? | Confianza de 0 a 1 |
| Preference | ¿Hay evidencia de cuánto le gustó? | Puntuación de -1 a +1 o NULL |

| Evidencia externa | Known | Consumed | Preference |
|---|---|---|---|
| Película en watchlist | 1 | 0 | NULL |
| Película vista sin valoración | 1 | 1 | NULL |
| Película con valoración alta | 1 | 1 | Positiva normalizada |
| Película con valoración baja | 1 | 1 | Negativa normalizada |
| Restaurante guardado | 1 | 0 | NULL |
| Restaurante con 5 estrellas | 1 | 1 | +1 |
| Steam comprado con 0 horas | 1 | 0 | NULL |
| Steam con muchas horas | 1 | 1 | Positiva inferida con confianza |
| Libro pendiente de leer | 1 | 0 | NULL |
| Libro leído sin rating | 1 | 1 | NULL |
| Asistencia cultural confirmada | 1 | 1 | +1 por regla de producto |
| Museo o restaurante visitado con evidencia suficiente | 1 | 1 | +1 por regla de producto |
| Evento previsto en calendario | Aproximadamente 0,8 | Menor que 1 | NULL |

Las inferencias de visitas y asistencia tienen menor prioridad que una valoración explícita. Una reserva, un ticket adquirido o una cita en calendario no prueban por sí mismos que hubo asistencia. Se conserva la diferencia entre intención, adquisición y asistencia confirmada.

El filtro inicial de conocidos excluye de Home un objeto cuando knownConfidence >= 0.80. El umbral es configurable en el backend. Un objeto puede ser conocido y no gustar, o ser conocido sin que exista ninguna preferencia registrada.

Para ratings de 1 a 10 se propone (rating - 5.5) / 4.5. Para otras escalas se documentan sus límites reales y su normalización. Si una fuente admite 0 o 0,5, no se aplica ciegamente la fórmula de 1 a 10. Una puntuación 0 representa neutralidad, mientras que NULL representa ausencia de evidencia.

## 6 Objetos del catálogo e imágenes

Profile Sources responden qué conoce o prefiere un usuario. Catalog Providers identifican el objeto y proporcionan título, descripción, imagen, categoría, fecha, ubicación, atributos y enlaces. Ambas arquitecturas están separadas, aunque una misma plataforma pueda desempeñar ambos papeles.

Una película importada desde tres fuentes debe convertirse en un único objeto canónico. Se conservan los IDs externos en catalog_external_ids. Prioridad de resolución propuesta: identificador canónico exacto, identificador del proveedor y finalmente combinación de atributos con una confianza documentada. Un título parecido no basta para fusionar dos objetos.

Para música la entidad recomendada es el artista; las canciones se agregan por artista. Un ISRC identifica una grabación y no se usa como identificador de artista. Para podcasts se agregan episodios por programa. ISBN identifica una edición: se conserva la relación entre obra y ediciones para evitar confundir traducciones o ediciones con libros diferentes.

```ts
export type Category =
  | "food" | "movies" | "series" | "music"
  | "games" | "books" | "culture" | "podcasts";

export interface CatalogImage {
  url: string;
  storageKey?: string;
  source: string;
  sourceImageId?: string;
  width?: number;
  height?: number;
  alt: string;
  attribution?: string;
  rightsOrPolicyReference?: string;
  fetchedAt?: string;
  expiresAt?: string;
  isFallback: boolean;
}

export interface CatalogItem {
  id: string;
  category: Category;
  itemType: string;
  title: string;
  description?: string;
  primaryImage: CatalogImage;
  externalIds: Record<string, string>;
  externalLinks: Array<{
    provider: string; url: string;
  }>;
  releaseDate?: string;
  eventStartsAt?: string;
  eventEndsAt?: string;
  parentItemId?: string;
  location?: {
    latitude: number; longitude: number;
    locality?: string; countryCode?: string;
  };
  metadata: Record<string, unknown>;
}
```

La imagen es obligatoria en el DTO que consume el carrusel; el catálogo puede estar provisionalmente sin imagen durante la resolución, pero debe aportar el fallback antes de publicar la tarjeta. Se almacena la referencia de imagen en BD y, cuando las condiciones del proveedor lo permiten, el archivo en almacenamiento S3 compatible. No se exige copiar todas las imágenes si el proveedor limita el almacenamiento.

Se contemplan recortes para formato de tarjeta, carga diferida, caché permitida, renovación de URLs caducadas y sustitución si falla el origen. Las fechas se almacenan con su precisión real: no se inventa un día si solo se conoce el año. Las fechas son necesarias para Trending.

## 7 Contrato común de observaciones

Toda fuente produce NormalizedObservation. La siguiente versión amplía el contrato original con identidad de evidencia, versión del mapper y precisión temporal para sincronizar sin duplicados y auditar inferencias.

```ts
export interface NormalizedObservation {
  userId: string;
  source: ProfileSourceKey;
  sourceRecordId: string;
  observationKind: string;
  mapperVersion: string;
  category: Category;
  externalItem: {
    sourceId: string;
    itemType: string;
    title: string;
    canonicalIds?: Record<string, string>;
    imageCandidate?: CatalogImage;
  };
  occurredAt?: string;
  timestampPrecision?: "instant" | "day" | "year";
  knownConfidence: number;
  consumedConfidence: number;
  preferenceScore: number | null;
  preferenceConfidence: number | null;
  preferenceBasis:
    | "explicit_rating" | "explicit_like"
    | "strong_behavior" | "attendance"
    | "weak_behavior" | null;
  engagement?: {
    type: "rating" | "liked" | "played"
      | "listened" | "attendance" | "review"
      | "owned" | "saved" | "completed";
    value?: number;
    unit?: string;
  };
  metadata?: Record<string, unknown>;
}
```

Las fechas se serializan como strings ISO 8601 al cruzar APIs y colas; se convierten a timestamp cuando procede en PostgreSQL. Los tipos internos pueden utilizar Date. preferenceScore y preferenceConfidence son ambos NULL si no existe preferencia. Las confianzas y puntuaciones deben validarse en runtime, además de TypeScript.

La clave idempotente propuesta combina conexión, sourceRecordId y observationKind. Para fuentes que solo ofrecen una instantánea acumulada se actualiza esa evidencia; no se crea una nueva reproducción por cada sync. Se distingue un evento histórico de una instantánea de biblioteca o de horas jugadas.

## 8 Arquitectura de integraciones

Todas las integraciones siguen una estructura común dentro de packages/integrations/profile. Cada una tiene index.ts, manifest.ts, auth.ts, client.ts, sync.ts, mapper.ts, schemas.ts, constants.ts, fixtures y tests. No se mantienen dos árboles de integración independientes en src y packages.

```ts
export type SourceAuthentication =
  | "oauth2" | "oauth1" | "api-key"
  | "openid" | "provider-session"
  | "native-permission" | "public-identifier";

export interface ProfileSourceManifest {
  key: ProfileSourceKey;
  name: string;
  categories: Category[];
  authentication: SourceAuthentication;
  syncStrategy:
    | "webhook" | "incremental"
    | "scheduled" | "full-refresh";
  capabilities: {
    known: boolean; consumed: boolean;
    explicitRating: boolean;
    implicitPreference: boolean;
    history: boolean; incrementalSync: boolean;
  };
}

export interface ProfileSourceAdapter {
  manifest: ProfileSourceManifest;
  connect(context: ConnectContext): Promise<AuthResult>;
  refreshConnection?(
    connection: UserConnection
  ): Promise<UserConnection>;
  sync(context: SyncContext): Promise<SyncBatch>;
  normalize(
    record: unknown, context: NormalizeContext
  ): Promise<NormalizedObservation[]>;
  disconnect(connection: UserConnection): Promise<void>;
}

export interface CatalogProvider {
  search(query: CatalogSearch): Promise<CatalogItem[]>;
  getItem(externalId: string): Promise<CatalogItem>;
  resolve(
    candidate: ExternalItemCandidate
  ): Promise<CatalogMatch | null>;
  getTrending?(
    context: TrendingContext
  ): Promise<CatalogItem[]>;
}
```

ConnectContext, AuthResult, SyncContext, SyncBatch y NormalizeContext se definen en shared. SyncBatch incluye registros, cursor, fecha de watermark, errores parciales y si la instantánea está completa. El registro genérico de adapters resuelve cada fuente por su key. La API controla el consentimiento, las conexiones y las credenciales; los workers ejecutan los syncs.

El motor de afinidad y el recomendador solo dependen de CatalogItem, UserItemProfile y NormalizedObservation. Se prohíben imports de Steam, Google, TMDb u otros proveedores dentro de los algoritmos. Añadir una fuente futura solo requiere un adapter y su registro, sin modificar las reglas centrales.

El enum de autenticación incorpora mecanismos adicionales al contrato inicial. Steam no debe modelarse automáticamente como OAuth: su documentación distingue la identificación web mediante OpenID y el acceso a la Web API mediante claves. La identificación de la cuenta no garantiza que su historial sea accesible [4, 5].

## 9 Fuentes de perfil previstas

La tabla describe datos deseados y reglas de normalización, no disponibilidad garantizada. Antes de implementar cada fuente, crear una ficha con documentación oficial, endpoints, scopes, aprobación, paginación, límites, permisos de almacenamiento y política de revocación. Las capacidades del manifest deben reflejar únicamente lo comprobado.

| Fuente | Categorías | Señales deseadas y tratamiento | Prioridad |
|---|---|---|---|
| Google Activity y Data Portability | Potencialmente las ocho | Reviews explícitas generan preferencia; guardados solo conocimiento. Validar datasets y scopes por producto | P0 estratégica |
| Apple Music | music | Biblioteca, favoritos, recurrencia y heavy rotation; agregar por artista y comparar actividad dentro del usuario | P0 |
| Last.fm | music | Scrobbles, artistas y loved tracks; frecuencia logarítmica y señales explícitas fuertes | P0 o P1 |
| SoundCloud | music | Likes, playlists, artistas seguidos y reproducciones accesibles; confianza según evidencia | P1 |
| TMDb | movies y series | Ratings, favoritos y listas disponibles; no suponer un historial de vistos inexistente | P0 |
| Plex | movies y series | Progreso y completado accesibles; visto sin rating no implica gusto | P1 |
| Steam | games | Propiedad, horas acumuladas y recientes; 0 horas no significa consumido | P0 |
| Google Books | books | Bibliotecas y estados disponibles; leído sin rating mantiene preferencia NULL | P0 o P1 |
| Podchaser | podcasts | Ratings, reviews y actividad accesible; agregar por podcast | P1 |
| Eventbrite | culture | Pedidos y registros accesibles; ticket no equivale a asistencia confirmada | P1 |
| Calendario iOS o Android | food y culture principalmente | Permiso nativo; evento previsto aporta conocimiento con incertidumbre, sin preferencia automática | P1 |

En música la frecuencia se transforma con log1p y/o percentiles del propio usuario; no se asigna la misma preferencia a 100 escuchas para todos. En Steam se propone min(1, log1p(hoursPlayed) / log1p(userP95Playtime)), con protección si el percentil es cero. La duración típica del juego y la confianza de esa inferencia deben documentarse.

Una escucha aislada puede confirmar consumo, pero no justifica por sí sola una preferencia positiva alta. Seguir un artista o un podcast tampoco demuestra haber escuchado toda su obra. Los loved tracks se agregan al artista manteniendo el origen y el alcance de la evidencia.

Los adapters de Google y Apple Music son prioritarios para el producto, pero el orden de desarrollo comienza por Steam, después TMDb y Last.fm para comprobar tres clases de evidencia. No se programan once conexiones reales simultáneamente.

Integraciones futuras previstas: Netflix, Disney+, Prime Video, Movistar+, Filmin, Stremio, Trakt si sus condiciones lo permiten, Spotify cuando exista una vía adecuada, Xbox, Epic, PlayStation, Discord si aporta actividad útil, DICE, Resident Advisor, Kultur, Ticketmaster, TheFork, Glovo, Just Eat, Uber Eats, Podimo, Apple Podcasts y Pódium. Ninguna se presenta como disponible hasta validarla.

## 10 Base de datos y consolidación

PostgreSQL con PostGIS almacena entidades, observaciones y resultados. Drizzle es la capa de consulta propuesta. El esquema se entrega mediante migraciones versionadas, constraints e índices, con un seed determinista para desarrollo.

| Grupo | Tablas principales |
|---|---|
| Identidad | users, user_profiles, user_settings |
| Conexiones | user_connections, oauth_credentials o source_credentials, source_sync_runs, provider_consents |
| Catálogo | catalog_items, catalog_external_ids, catalog_images |
| Evidencia | user_item_observations, user_item_profiles |
| Afinidad | category_affinities, user_affinities |
| Recomendaciones | recommendation_candidates, recommendation_impressions, recommendation_actions, home_dismissals |
| Social | friends, contact_matches, messages, message_requests, user_blocks, user_reports |
| Producto | subscriptions, notification_preferences |

user_item_observations conserva id, user_id, catalog_item_id, connection_id, source_key, source_record_id, observation_kind, mapper_version, las tres dimensiones, confidence, preference_basis, engagement, occurred_at, synced_at y metadata. La fecha de sync no reemplaza la fecha de actividad.

user_item_profiles consolida una fila por usuario y objeto: known_confidence, consumed_confidence, preference_score, preference_confidence, evidence_count, first_seen_at, last_seen_at y versión de consolidación. La evidencia original permite recalcularla sin perder trazabilidad.

Prioridad de consolidación: valoración explícita > like o dislike explícito > inferencia conductual fuerte > supuesto de asistencia > inferencia débil. Si una visita aporta +1 y un rating posterior aporta una preferencia negativa, prevalece el rating. Entre evidencias comparables se consideran fecha y confianza, sin sumar copias de la misma actividad procedentes de distintos proveedores.

Se propone mantener la última valoración por fuente y objeto, combinar valoraciones explícitas de distintas fuentes por confianza y registrar conflictos. Las reglas de conocimiento y consumo no deben inflar la confianza por evidencias duplicadas correlacionadas.

Constraints esenciales: puntuaciones y confianzas en sus rangos; NULL coherentes; unicidad de IDs por proveedor y tipo; unicidad de perfiles por usuario y objeto; afinidades por pareja ordenada y categoría; idempotencia de evidencia; relaciones sin autorreferencias. Los IDs numéricos de películas y series de un mismo proveedor no se confunden: incluir namespace o tipo de objeto.

Al desconectar una fuente se revoca el acceso y se detienen los jobs. El usuario puede eliminar lo importado de esa fuente. Se borran sus observaciones, se recalculan perfiles afectados y se invalidan afinidades y recomendaciones dependientes. Se mantiene la evidencia de otras fuentes autorizadas. La eliminación de cuenta incluye credenciales, evidencias, ubicación y datos personales asociados.

## 11 Motor de afinidad

El motor es determinista, explicable, testeable y versionado. No utiliza IA generativa. Compara preferencias consolidadas del mismo objeto, incluyendo gustos y disgustos. Known o Consumed sin Preference no bastan para medir acuerdo de gustos.

Para cada categoría se calcula common evidence, agreement, cobertura direccional y confianza. Acuerdo por objeto: agreement = 1 - abs(scoreA - scoreB) / 2. Dos +1 producen 1; +1 frente a -1 produce 0. Se pondera el acuerdo por confianza de las preferencias comparadas.

Propuesta V1 para un caso comparable:

```text
C = objetos con preferencia comparable en A y B
N_A = objetos de A con preferencia válida en la categoría
w_i = min(confidenceA_i, confidenceB_i)
n_eff = suma(w_i)
agreement = suma(w_i * agreement_i) / suma(w_i)
evidenceFactor = 1 - exp(-n_eff / tau_category)
coverage(A -> B) = |C| / N_A
coverageFactor = 0.80 + 0.20 * sqrt(coverage)
dataConfidence = media(w_i)
categoryAffinity = 100 * agreement * evidenceFactor
                   * coverageFactor * dataConfidence
```

tau_category y los mínimos se configuran por categoría. La función de cobertura suavizada es una propuesta para evitar que una persona con un historial enorme reciba afinidades sistemáticamente casi nulas. No está calibrada todavía. Si no hay objetos comparables suficientes, el resultado es NULL. Si hay evidencia suficiente y desacuerdo completo, el resultado puede ser 0.

Se necesita validar la fórmula con perfiles simulados de tamaños diferentes. Los ejemplos de 94 %, 95 % o 76 % son ilustrativos y no se hardcodean. Si la multiplicación de factores impide resultados altos aun con mucha evidencia y gran acuerdo, documentar la calibración necesaria antes de dar por validado el motor.

La afinidad global es la media ponderada de categorías no NULL. El peso depende de cantidad, calidad y profundidad de la información del usuario de origen. Se propone log1p(número de objetos válidos) ajustado por confianza; se utilizan objetos distintos o evidencia efectiva para evitar que miles de scrobbles dupliquen el peso de una sola preferencia.

Se conservan affinity_score, affinity_confidence, categories_compared, common_items, computed_at y algorithm_version. Varias categorías comparables aumentan la confianza global. La UI muestra la puntuación de afinidad y distingue claramente la falta de datos; no promete que sea una probabilidad estadística de amistad.

El pipeline selecciona usuarios elegibles, aplica un prefiltro conservador, calcula afinidades por categoría, consolida la global y genera un ranking estable. Empates: score, confidence, evidencia y un identificador estable. El prefiltro debe preservar candidatos relevantes; se comprueba contra cálculo exhaustivo en datasets pequeños.

Se actualiza tras sync significativa y mediante jobs periódicos e incrementales. No se calcula toda la matriz de usuarios al abrir la app. Las afinidades direccionales se almacenan por pareja ordenada.

## 12 Recomendaciones de consenso y descubrimiento

La mezcla objetivo de Home es **70 % consenso de almas gemelas, 20 % descubrimiento individual y 10 % Trending**. Las cuotas se aplican a bloques o sesiones suficientemente largos; en una cola de 10 tarjetas completa se busca 7, 2 y 1. No se promete esa proporción exacta en tres tarjetas.

El 70 % utiliza exclusivamente las Top 50 almas gemelas disponibles. Cada persona tiene el mismo peso dentro de esta parte. Se calculan número de apoyos positivos únicos, preferencia media y confianza de evidencia. Una misma persona no vota tres veces por conectar tres fuentes.

Propuesta de puntuación: consensusScore × averagePositivePreference × evidenceConfidence. Se conservan denominador, número de apoyos y reglas de positividad. El usuario 51 no influye en este bloque, incluso si Premium permite explorar más personas.

El 20 % parte de una persona concreta con alta afinidad global y/o de categoría. El objeto necesita preferencia positiva fuerte en esa persona y knownConfidence del usuario destino por debajo del umbral. Se registra quién aportó la recomendación. La afinidad puede influir aquí en la elección de la persona.

Filtros comunes: excluir objetos conocidos de Home, descartes activos, objetos duplicados en la sesión, personas bloqueadas, elementos locales fuera del radio y eventos ya terminados. La antigüedad del objeto no limita consenso o descubrimiento: una película antigua sigue siendo válida en esos bloques.

Si un bloque carece de candidatos se utiliza otro bloque válido o una recomendación de similitud de contenido, con reasonCode y fallback explícitos. Las cuotas son un objetivo cuando existen candidatos. No se inventa apoyo de almas gemelas ni se etiqueta un fallback como Trending local.

## 13 Trending local del año actual

Trending utiliza valoraciones altas del conjunto de usuarios de APPINITY ubicados en la misma zona que el usuario objetivo, **independientemente de su afinidad**. No se limita a las almas gemelas. No utiliza likes, swipes ni votos creados dentro de APPINITY.

Un voto es una valoración explícita importada de una fuente conectada. Propuesta inicial: preferenceScore >= 0.60 y preferenceConfidence >= 0.80. El umbral se ajusta a la escala normalizada. Asistencia inferida, horas jugadas y escuchas no se presentan como una votación explícita.

Cada persona aporta como máximo una valoración consolidada por objeto. Se excluye al propio destinatario, cuentas no elegibles, evidencia eliminada y usuarios bloqueados. La afinidad no interviene en la selección de votantes ni en el peso del voto. Los datos de ubicación no se exponen individualmente.

**Interpretación temporal propuesta para resolver objetos con y sin fecha de estreno:**

| Tipo de objeto | Regla para Trending |
|---|---|
| Película, libro y videojuego | Año de estreno o publicación igual al año actual |
| Serie o temporada | Estreno de la serie o de la temporada concreta en el año actual; una serie antigua no pasa por tener actividad reciente |
| Evento cultural | Ocurre en el año actual y no ha terminado |
| Restaurante, artista, lugar cultural o podcast como programa | Valoraciones explícitas de ese objeto recibidas durante el año actual; no se utiliza su fecha de creación |

Para entidades permanentes esta es una propuesta operativa, porque exigir que un restaurante o artista se haya creado este año cambiaría el concepto del producto. En contenidos con fecha, los objetos de años anteriores quedan excluidos de Trending. Esta restricción no se extiende a las otras dos fuentes de Home.

Además, los votos agregados deben corresponder al año actual. Se usa occurredAt de la valoración, nunca syncedAt. Si la fecha de estreno requerida o la fecha de valoración no se conoce con suficiente precisión, el objeto o voto no participa en Trending; se conserva para otros usos. El año se obtiene del reloj y la zona horaria del usuario, sin hardcodear 2026.

Propuesta de zona: usuarios cuya ubicación aproximada consentida está dentro del radio configurado, 10 km por defecto. Si falta ubicación se solicita una zona manual o se desactiva Trending local; no se presume una ciudad ni se inventan votantes.

Para categorías locales también se verifica la ubicación del objeto. Para categorías globales solo se limita geográficamente a la comunidad que valora. Un usuario de Barcelona puede recibir una película global estrenada este año y bien valorada por otros usuarios de su zona.

Propuesta de ranking: media de valoraciones con suavizado bayesiano, proporción de votos altos y número de votantes únicos, con un mínimo inicial de 5 personas y parámetros configurables. Se consideran también ratings bajos para evitar seleccionar solo los positivos y ocultar el desacuerdo. Guardar positiveVoters, totalVoters, averageScore, period y cohortDefinition.

Si no hay votos locales suficientes, no se llama Trending a la popularidad global de un catálogo externo. Ese proveedor puede ayudar al cold start con una etiqueta distinta. No se amplía el radio automáticamente por encima de lo configurado.

## 14 Cold start onboarding y sincronización

Onboarding: pantalla de concepto y login Google, Apple o email; confirmación 18+ y aceptación de condiciones y privacidad; pantalla «Conecta tu mundo» con fuentes disponibles. El usuario elige una o varias y se ejecutan sus flujos secuencialmente. Debe completar al menos una conexión real para finalizar el onboarding de producción.

Las fuentes no disponibles se muestran como próximas o se omiten; nunca se simula un éxito OAuth. La versión de desarrollo puede arrancar con fixtures mediante DEMO_MODE claramente identificado y desactivado en producción.

Si todavía no hay comunidad o evidencia suficiente, se utiliza similitud de contenido, tendencias válidas e historial disponible. Textos sugeridos: «APPINITY está aprendiendo tus gustos» y, cuando existan candidatos reales, «Hemos encontrado tus primeras almas gemelas». La transición es automática.

No se depende de un botón «Importar». Cada fuente declara webhook, incremental, scheduled o full-refresh según su capacidad. El usuario ve estado, última sincronización, errores accionables y opción de desconectar. La frecuencia no se promete hasta conocer límites del proveedor.

Pipeline: móvil y API gestionan conexión; una cola lanza Provider Worker; el mapper normaliza; Entity Resolver identifica objetos; PostgreSQL almacena y consolida; Affinity Worker actualiza afinidades; Recommendation Worker genera candidatos.

Los jobs contemplan paginación, cursores persistidos tras éxito, locks por conexión, retries con backoff, límites de API, renovación de credenciales y errores parciales. Un sync fallido no avanza el cursor ni borra toda la evidencia anterior. La desconexión impide que un job tardío vuelva a escribir datos revocados.

Calendario nativo es una excepción de transporte: el dispositivo obtiene los datos bajo permiso y envía solo observaciones relevantes o candidatos mínimos; el backend sigue controlando consolidación y recomendaciones. No se suben indiscriminadamente todos los eventos personales.

## 15 Arquitectura y stack

| Capa | Tecnología propuesta |
|---|---|
| Móvil | React Native, Expo, TypeScript y Expo Router |
| Estado y datos | TanStack Query y Zustand |
| Gestos | Reanimated y Gesture Handler |
| Idiomas | i18next, con textos externos al código |
| API | Node.js, TypeScript y NestJS |
| Base de datos | PostgreSQL, PostGIS y Drizzle |
| Colas y workers | Redis y BullMQ |
| Archivos e imágenes | Almacenamiento S3 compatible, cuando esté permitido |
| Push | Expo Push, FCM y APNs según la plataforma |
| Suscripciones | RevenueCat |
| Observabilidad | Sentry y PostHog con minimización de datos |

pgvector es opcional para una etapa posterior; no es un requisito inicial. Se propone pnpm workspaces para el monorepo. Claude comprobará versiones compatibles en documentación oficial, fijará versiones y lockfile y evitará afirmar que una versión es estable sin verificarla.

```text
appinity/
  apps/
    mobile/
    api/
  packages/
    database/
    shared/
    algorithms/
    integrations/
      profile/
        steam/
        tmdb/
        lastfm/
    catalog/
    i18n/
  workers/
    sync-worker/
    affinity-worker/
    recommendation-worker/
  docs/
    APPINITY_Especificacion.md
    architecture.md
    decisions.md
    progress.md
    integration-capabilities.md
  CLAUDE.md
```

La implementación inicial necesita servicios locales de PostgreSQL con PostGIS y Redis, por ejemplo mediante Docker Compose. Docker Compose es una propuesta de desarrollo, no una elección definitiva de hosting. El backend se publica en una fase posterior en infraestructura que soporte base de datos, workers y secretos; una web estática no sustituye a estos servicios.

## 16 Social Premium y notificaciones

Mensajería con feature flags: EARLY_ACCESS permite chat gratuito con solicitud y aceptación; PREMIUM_DIRECT_MESSAGE permite que Premium envíe directamente el primer mensaje. El receptor puede responder, ignorar, bloquear o reportar. Ignorar no genera afinidad ni otras señales culturales.

Los permisos se validan en backend. Bloquear detiene mensajes y elimina la relación de superficies sociales y recomendaciones atribuidas. Se contemplan límites de envío y prevención de abuso sin introducir un feed social ni perfiles complejos.

Premium previsto: 0,99 EUR al mes o 4,99 EUR al año. Son precios de producto propuestos, no una afirmación sobre comisiones, rentabilidad ni aprobación de tiendas. Los identificadores y precios comerciales reales se configuran en las plataformas de suscripción.

Incluye más de 50 almas gemelas para explorar, filtros, recomendaciones personales de cualquier soulmate, recomendaciones individuales de amigos, mensajería, información social avanzada y futuras estadísticas. Esto no cambia la regla del bloque de consenso: sigue utilizando Top 50 con igual peso.

Durante la beta temprana puede utilizarse «Premium desbloqueado durante Early Access». RevenueCat y los webhooks de suscripción deben verificar entitlements en el servidor, con tratamiento idempotente. No se decide Premium únicamente desde una variable del cliente.

Notificaciones por defecto: tres por semana. Opciones: diaria, tres por semana, semanal o desactivadas. Se envían motivos concretos como «19 de tus almas gemelas coinciden en esta película». El conteo debe corresponder a evidencia vigente. Se propone respetar zona horaria, horario tranquilo y deduplicación.

## 17 Privacidad y seguridad del MVP

Requisitos: consentimiento separado por proveedor, scopes mínimos, revocación, eliminación de datos importados y cuenta, cifrado de credenciales, bloqueo y reporte, control de descubrimiento por contactos y minimización del tratamiento de datos. La evaluación de cumplimiento normativo requiere revisión específica; este documento define requisitos de implementación, no certifica cumplimiento legal.

Los tokens OAuth de proveedores nunca se entregan al cliente móvil. Cuando una plataforma requiera un SDK o permiso nativo, se utiliza solo el material que ese flujo exige y se documenta la excepción técnica; las credenciales de servidor permanecen en el backend. El usuario inicia los flujos en páginas o SDKs oficiales, sin entregar contraseñas a APPINITY.

Autorización por recurso en todas las APIs; secretos en variables seguras, no en Git; logs sin tokens, agenda, historial cultural completo ni ubicación precisa; validación de callbacks según el mecanismo; límites de acceso; validación de entradas y enlaces; separación de datos de demo y producción.

La recomendación atribuida a otra persona no concede acceso a sus observaciones. Los DTOs públicos solo exponen perfil mínimo, afinidades y el motivo de recomendación permitido. Las eliminaciones invalidan materializaciones y cachés para no mantener datos borrados en rankings o tarjetas.

## 18 Fases de implementación y aceptación

Cada fase produce código ejecutable, comprobaciones relevantes, instrucciones para probar y un registro actualizado del progreso. Las conexiones reales dependen de credenciales y permisos; las partes independientes continúan con fixtures identificados mientras tanto.

| Fase | Entrega | Criterio de aceptación |
|---|---|---|
| 0 | Monorepo, API, app móvil, BD, Redis, auth base, navegación e i18n | Instalación reproducible, API health, migración y app con cuatro pestañas |
| 1 | Catálogo con imágenes, observaciones, consolidación y fixtures | Distingue conocido, consumido y gusto; resuelve IDs y muestra imágenes con fallback |
| 2 | Steam como primer adapter | Fixture y flujo real validado: conectar, sync, normalizar, guardar, repetir sin duplicar |
| 3 | TMDb | Importa ratings disponibles y normaliza escalas reales sin inventar un historial |
| 4 | Last.fm y agregación musical | Agrega por artista y calibra señales dentro de cada usuario |
| 5 | Afinidad direccional versionada | Pruebas con desacuerdo, NULL, historiales desiguales y múltiples categorías |
| 6 | Ranking Top 50 | Excluye bloqueos y al propio usuario; orden estable y perfiles mínimos |
| 7 | Recomendador y Trending actualizado | Mezcla 70/20/10 cuando hay datos; votos locales, año dinámico y razones reales |
| 8 | Home con carrusel | Swipe, botones, Undo, NEW, persistencia del descarte y enlaces |
| 9 | Categories | Ocho categorías; descartes de Home visibles aquí; cold start de categoría |
| 10 | People y Friends | Perfil mínimo, solicitudes, contactos bajo permiso y bloqueo |
| 11 | Resto de adapters viables | Cada uno aislado, documentado y con fixtures; otros quedan desactivados |
| 12 | Chat, Premium y notificaciones | Flags, solicitudes, entitlements y frecuencias respetadas |
| 13 | Preparación de beta | Flujo completo, revisión de permisos, builds y documentación operativa |

La secuencia conserva la arquitectura planteada y añade una salida explícita de beta. Auth de producción y la conexión mínima obligatoria deben estar terminadas antes de la beta, aunque al principio se pruebe con identidad de desarrollo.

## 19 Pruebas críticas

Adapters: fixture original → mapper → observaciones esperadas; contratos, rangos, paginación, duplicación, instantáneas, scopes y error parcial. Una API modificada debe afectar a su adapter, sin romper la estructura del motor.

Modelo: owned con 0 horas mantiene consumed = 0 y preference = NULL; watchlist no genera gusto; visto sin rating conserva NULL; rating negativo prevalece sobre asistencia +1; tres fuentes del mismo objeto resuelven una entidad; imagen ausente muestra fallback.

Afinidad: no hay evidencia produce NULL; desacuerdo real puede producir 0; A → B puede diferir de B → A; evidencia débil no crea un 99 % injustificado; categorías faltantes no reducen el resultado como si fueran ceros; blocked users no aparecen.

Recomendador: consenso ignora persona 51; votos únicos y peso igual; descubrimiento identifica a su persona; conocidos y descartados quedan fuera de Home; Undo recupera; Categories no aplica el descarte; ninguna acción modifica user_item_profiles.

Trending: estreno anterior al año actual queda fuera en entidades con fecha; año nuevo cambia el filtro según reloj y zona horaria; syncedAt no se usa como fecha de voto; un artista antiguo puede participar por valoraciones actuales bajo el criterio propuesto; votantes fuera de la zona no cuentan; la afinidad no altera su peso; un voto duplicado no aumenta el conteo; menos del mínimo produce ausencia de Trending local.

Seguridad y extremo a extremo: el cliente no recibe tokens de proveedores ni historial de terceros; una persona no modifica conexiones ajenas; desconectar cancela jobs; borrar una fuente recalcula derivados; eliminar cuenta borra su información; entitlement y chat se verifican en backend. Las pruebas del flujo móvil deben usar los recursos apropiados para Expo y dispositivos, no solo una captura web.

Las versiones affinity_algorithm_version y recommendation_algorithm_version acompañan resultados. Mapper y consolidación también se versionan. Un cambio de reglas permite recalcular desde evidencias conservadas, sin perder el origen de cada inferencia.


## 20 Alcance de esta copia y decisiones propuestas

Requisitos de producto congelados desde la especificación v1.0 del 5 de octubre de 2026. Esta copia adapta únicamente las instrucciones de ejecución a Claude, el nombre del archivo de instrucciones y las referencias finales. No contiene código ni entregas de la implementación de Codex. Construir desde cero en appinity-claude.

Mantener como propuestas, no como parámetros ya calibrados: fórmula de afinidad, umbrales de evidencia y positividad, mínimos de Trending, interpretación temporal de entidades permanentes, organización de las cuatro pestañas y precios de Premium. Registrar en docs/decisions.md los valores adoptados y su validación. No cambiar requisitos para conseguir una demo más vistosa.

Referencias técnicas citadas en las secciones de Steam:

[4] Valve. Authentication using Web API Keys. https://partner.steamgames.com/doc/webapi_overview/auth

[5] Valve. User Authentication and Ownership. https://partner.steamgames.com/doc/features/auth

Para ejecutar las fases, usar docs/APPINITY_Prompt_Claude_Desde_Cero.md y prompts/. Los capítulos de uso de Codex del documento original se han excluido de esta copia porque no corresponden a este proyecto.
