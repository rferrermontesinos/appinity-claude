# Progreso · APPINITY Claude

Leyenda: **Implementado** (código en el repositorio) · **Comprobado automáticamente** (tests o comandos
ejecutados aquí) · **Aceptado en dispositivo** (lo confirma el usuario en su teléfono).

| Fase | Estado | Evidencia / siguiente paso |
|---|---|---|
| 0 | **Aceptado en dispositivo** (2026-10-08) | Entrega 2026-10-08 · fase 0 (rama `fase-0`, PR rferrermontesinos/appinity-claude#1) |
| 1 | **Aceptado en dispositivo** (2026-10-08) | Entrega 2026-10-08 · fase 1 (rama `fase-1`, PR rferrermontesinos/appinity-claude#2, basada en `fase-0`) |
| Aceptación de demo | **Hecha** | El usuario confirmó: «He probado la demo y funciona» |
| 2 | **Validado con la cuenta real del usuario** (2026-10-08) | Entrega 2026-10-08 · fase 2 (rama `fase-2`, PR rferrermontesinos/appinity-claude#3, basada en `fase-1`) |
| Revisión de fuentes | **Hecha** (2026-10-08) | Especificación 1.1 y docs/fuentes-de-datos.md (rama `especificacion-fuentes`, PR rferrermontesinos/appinity-claude#5, basada en `fase-2`). TMDb descartada: PR rferrermontesinos/appinity-claude#4 cerrada sin fusionar |
| Revisión de fuentes · decisiones | **Aceptada** (2026-10-09) | El usuario aceptó la especificación 1.1; de momento, imagen genérica (sin licencia de catálogo); Gmail se evaluará más adelante |
| 3 | **Sincronizado con la cuenta real del usuario** (2026-10-09); pendiente de revisar la identificación con el siguiente export y de la aceptación en la app | Entrega 2026-10-09 · fase 3 (rama `fase-3-google`, PR rferrermontesinos/appinity-claude#6, basada en `especificacion-fuentes`). Primer sync: 21 evidencias (20 reseñas y 1 sitio guardado) |
| 4 | **Validado con la cuenta real del titular**: 49 escuchas agregadas de YouTube y YouTube Music y 2 suscripciones importadas (comprobado en la BD el 2026-10-26) | Entrega 2026-10-13 · fase 4 (rama `fase-4-youtube`, basada en `fase-3-google`) |
| 5 | **Implementado y comprobado automáticamente** | Entrega 2026-10-13 · fase 5 (rama `fase-5-afinidad`, basada en `fase-4-youtube`). Calibración en decisions.md |
| 6 | **Implementado, comprobado automáticamente y verificado en la vista web** | Entrega 2026-10-13 · fase 6 (rama `fase-6-top50`, basada en `fase-5-afinidad`). Pendiente de aceptación en el teléfono |
| 7 | **Implementado y comprobado automáticamente** | Entrega 2026-10-14 · fase 7 (rama `fase-7-recomendador`, basada en `fase-6-top50`). Sin pantalla: Home llega en la fase 8 |
| 8 | **Aceptado en el teléfono** (2026-10-14) | Entrega 2026-10-14 · fase 8 (rama `fase-8-home`, basada en `fase-7-recomendador`) |
| 9 | **Implementado, comprobado automáticamente y verificado en la vista web** | Entrega 2026-10-14 · fase 9 (rama `fase-9-categories`, basada en `fase-8-home`). Incluye el feed continuo pedido por el usuario |
| 10 | **Implementado y comprobado automáticamente**; contactos del dispositivo añadidos (2026-10-26), pendiente de probar en el APK nuevo | Entrega 2026-10-14 · fase 10 (rama `fase-10-people`) y entrega 2026-10-26 (contactos) |
| 11 | **Paso 1 implementado** (Google: Play, pedidos y guardados), comprobado automáticamente y en parte con servicios reales; falta un export real | Entrega 2026-10-14 · fase 11 (rama `fase-11-fuentes`). Análisis en [source-candidates.md](source-candidates.md) |
| 12 | **12C (push, servidor) implementada y comprobada automáticamente**; envío real pendiente de build de desarrollo y FCM · **12B (Premium, servidor) implementada y comprobada automáticamente**; compra en la app pendiente de cuentas y build de desarrollo · **12A (chat) implementada, comprobada automáticamente y verificada en la vista web**; 12B (Premium/RevenueCat) y 12C (push) pendientes | Entrega 2026-10-14 · fase 12A (rama `fase-12a-chat`, basada en `fase-10-people`) |
| 13 | **Preparada**: auth de producción, alta, eliminación de cuenta y despliegue probados en local; beta real pendiente de dominio, servidor y cuentas ([beta.md](beta.md)) · auditoría de seguridad de la API hecha (2026-10-26) · textos legales en borrador (2026-10-26) | Entrega 2026-10-15 · fase 13 (rama `fase-13-beta`) |

---

## Entrega 2026-10-26 (6) · «Aura» en Personas (momento Wrapped)

### Qué se ha hecho

- **Tarjeta de afinidad** (`SoulmateHero.tsx`): el alma gemela n.º 1 con la cifra enorme, que cuenta al aparecer; sus 3
  categorías más afines, con barras que crecen; «Tenéis N gustos en común», que suma `commonItems` (solo el recuento,
  nunca cuáles); la versión del cálculo y el aviso de que la afinidad de la otra persona hacia ti puede ser distinta;
  «Afinidad mutua excepcional» si procede, y «Ver perfil». Datos reales de `/v1/people/:id`. No se inventan obras en
  común: la maqueta las nombraba, pero la API no las expone (privacidad).
- **Filas** del resto del Top 50: avatar con aro lima, cifra en Bricolage y flecha. Avatar sin foto con un color
  estable según el nombre, solo decorativo.
- Textos nuevos en es/en. Respeta «reducir movimiento» (sin conteo ni crecimiento).

### Comprobaciones

- Contraste calculado en el peor caso (brillo lima al máximo y acento más claro): texto 7,62:1, texto atenuado 5,39:1
  y lima 6,79:1; inicial del avatar ≥ 6,66:1.
- `pnpm lint` y `pnpm typecheck` limpios; `pnpm test`: 37 ficheros y 366 tests OK.
- Vista web (390×844, demo): «Clara (demo) y tú», 86 %, Películas, Libros y Restaurantes, 10 gustos en común.
- Nota: la vista web lee `packages/i18n/dist`; tras añadir textos hay que ejecutar `pnpm build`.

### Pendiente

- Ver Inicio y Personas en el teléfono (recargar la app).
- Categorías, Perfil, ficha de persona, barra inferior y guía del sistema de diseño.

## Entrega 2026-10-26 (5) · «Aura» en tokens y en Inicio

### Qué se ha hecho

- **Tokens** (`apps/mobile/src/theme.ts`): neutros fríos-oscuros (`#0C0C0E` → `#17161B` → `#211F27`), chispa
  `#FF5E4D` para la acción principal, token nuevo `affinity` (lima `#D4F45A`; oliva `#4D6A00` en claro) para afinidad
  y almas gemelas, y `motion` (muelle y fundido de 0,5 s). Las claves antiguas siguen como alias: el resto de
  pantallas cambia de color sin tocarlas. La cifra de afinidad (`Affinity.tsx`) pasa a lima.
- **Tipografía**: Bricolage Grotesque 600/700/800 (`@expo-google-fonts/bricolage-grotesque`, OFL) en lugar de Space
  Grotesk; `fonts.displayHeavy` para la marca, el título de la tarjeta y las cifras.
- **Inicio**: marca «appinity.»; halo del color de la categoría de la tarjeta, que se funde al cambiar (sin
  degradados nativos: círculos concéntricos y grano en `assets/grain.png`; nada de módulos nativos nuevos, no hace
  falta otro APK); tarjeta con portada arriba y panel de texto debajo, brillo de su categoría, motivo en caja elevada
  (icono lima si viene de personas, etiqueta «Trending» si es de la zona); botones con etiqueta y conservar en
  chispa con brillo. Respeta «reducir movimiento».
- **Portada generada** (`CatalogImage`): base teñida, brillo, banda diagonal, primera palabra del título enorme,
  icono y rótulo «Portada generada». También en la ficha y en Categorías.

### Comprobaciones

- Contraste calculado (WCAG) de todos los pares nuevos en ambos temas: mínimo 4,76:1 (texto tenue sobre
  `surfaceAlt`).
- `pnpm typecheck` y `pnpm lint` limpios; `pnpm test`: 37 ficheros y 366 tests OK.
- Vista web (8092, 390×844, demo): Inicio con halo, tarjeta y botones por encima de la barra; portada generada de
  Radiolab en su ficha. Durante la prueba se descartó una tarjeta de la demo.

### Pendiente

- **Ver en el teléfono** (Expo Go o APK actual): recargar la app. Comprobar el halo, el grano y el brillo de la
  tarjeta en Android (las sombras `boxShadow` necesitan la nueva arquitectura, activa en SDK 57).
- La guía `docs/design/design-system/` sigue en «Noche de cine»: actualizarla con los tokens Aura.
- Siguientes pantallas: Personas (momento Wrapped de la maqueta), Categorías y Perfil; la barra inferior aún usa la
  píldora antigua.

## Entrega 2026-10-26 (4) · Rediseño: dirección «Aura» y maqueta

### Qué se ha hecho

- `/creative` (design-superpowers, nivel L2: ya existía el sistema «Noche de cine»). El titular eligió **rehacer**
  con tono vibrante y social (Spotify Wrapped, Hinge/Tinder) y, de tres variantes, la **B · «Aura»**
  (decisions.md, 2026-10-26).
- Maqueta HTML de **Inicio** (con selector cine / música / juegos para ver el halo y los tres tipos de motivo:
  almas gemelas, consenso y trending) y **Personas** (afinidad como momento Wrapped, «—» sin datos):
  `docs/design/aura/mockup.html`. Datos de ejemplo; portadas generadas.

### Comprobaciones

- Revisada en el navegador integrado: corregido el solape de los botones del mazo con la barra inferior.
- Contraste calculado de los pares de texto nuevos (texto apagado `#938F88` ≥ 4,9:1 sobre fondo, superficie y superficie elevada;
  chispa y lima con su texto ≥ 4,5:1). Falta comprobar el texto sobre el halo de Personas en el teléfono.

### Siguiente paso

- Aceptación de la maqueta por el titular. Después: paleta y tipografía completas (Palette Architect y Typography
  Director), tokens en `styles.css` y `apps/mobile/src/theme.ts`, y aplicación pantalla a pantalla empezando por Inicio.

## Entrega 2026-10-26 (3) · Imágenes más representativas y siguiente paso de diseño

### Qué se ha hecho

- Imágenes por categoría (decisions.md, 2026-10-26): en cine, cartel o logotipo y nunca la foto genérica; tipo de
  imagen guardado (`catalog_images.kind`, migración 0016); el worker revisa al arrancar las imágenes guardadas. En la
  app, logotipo entero sobre un cartel de la categoría y cartel de diseño cuando no hay imagen.
- Investigado: Plex y Stremio usan TMDb, TheTVDB y fanart.tv; los pósteres reales exigen un acuerdo comercial.
- `pnpm test`: 37 ficheros y 366 tests OK.

### Crítica de diseño de Inicio (/design:design-critique) aplicada

- Línea de contexto bajo el título (autor o director · año · género; localidad en lugares). El worker completa el
  catálogo real con descripción, personas y géneros de Wikidata (`enrichDetailsFromWikidata`, una vez por objeto).
- «Ver ficha» (48 dp) en lugar del enlace «wikidata»; Inicio sin cabecera (marca pequeña); ayuda de gestos solo en las
  3 primeras tarjetas; cartel de sustitución con el nombre de la categoría como textura tipográfica.
- Commit `aaf4666`; 366 tests OK; verificado en la vista web.

### Pendiente

- **Reiniciar `pnpm api` y `pnpm worker`** (los tiene el titular en sus pestañas) para aplicar la revisión de
  imágenes; después, recargar la app.
- **Rediseño más profesional**: el titular quiere usar el plugin design-superpowers (`/creative` y siguientes) en una
  sesión nueva. Pedirle 3–4 apps de referencia, 3 palabras de tono y la pantalla por la que empezar (Inicio). El
  sistema actual es «Noche de cine» (docs/design/design-system/).

## Entrega 2026-10-26 (2) · D5 aceptada, contactos (fase 10) y textos legales (fase 13)

### Qué se ha hecho

- **D5 aceptada en el teléfono** por el titular: texto grande y TalkBack. Corregido durante la prueba: el teclado tapaba
  la caja del chat (Android de borde a borde) y la siguiente tarjeta de Inicio no se veía al deslizar.
- **Decisiones del titular**: sin lista de «recomendaciones de una persona» y barra inferior oculta en las pantallas
  de detalle (decisions.md).
- **Amigos desde los contactos (cierra la fase 10)**: `POST /v1/me/contacts/match` compara el SHA-256 de emails
  normalizados con los emails verificados de quien lo permite; no guarda nada; 5 peticiones por minuto y 500 emails por
  petición. En la app, «Buscar en mis contactos» en Amigos (permiso bajo demanda) con «Añadir». Los módulos nativos se
  cargan al pulsar: un APK anterior avisa en lugar de fallar.
- **Textos legales (fase 13)**: `/legal/condiciones` y `/legal/privacidad`, públicas y enlazadas desde el alta.
  Borrador: faltan el responsable y el contacto, y la revisión legal. La privacidad incluye la declaración de uso
  limitado que pide Google.
- **APK de desarrollo nuevo** con `expo-contacts` y `expo-crypto` (`pnpm android:build`).

### Comprobaciones

- Tests nuevos: contactos (coincidencia, ajuste desactivado, bloqueo, formato, tamaño y límite) y páginas legales.
  `auth.int.test.ts` 8/8 y `api.int.test.ts` 13/13; lint y typecheck limpios.
- API reiniciada; `/legal/privacidad` responde desde la red local.

### Bloqueos (cuentas del titular, sin coste)

- **Push (12C) en la app**: proyecto de EAS (`eas init`, cuenta de Expo) y Firebase con FCM V1 para Android. El
  `google-services.json` va dentro del APK: se añadirá `expo-notifications` en esa misma compilación.
- **YouTube (fase 4)**: añadir 3 permisos en Google Cloud (README).
- **Beta (13)**: dominio y servidor (de pago: necesita una tarea específica), datos del responsable en los textos
  legales y su revisión.

## Entrega 2026-10-26 · Tus gustos, auditoría de seguridad, alta (D2/D3) y D5 con texto grande

### Qué se ha hecho

- **Incidencia**: el teléfono no cargaba tras reiniciar el PC: Metro (8091) no estaba en marcha y Expo Go probó con la
  vista web (8092). Metro arrancado de nuevo; la app ya carga (confirmado por el titular).
- **Tus gustos** (explicabilidad, diagnóstico §2.4): tarjeta en Perfil con el total, los gustos y disgustos claros
  (±0,3), lo que no tiene opinión (NULL), el recuento por categoría y por fuente. El detalle se titula «Tus gustos» en
  cuentas reales, nombra la fuente de cada obra y ordena primero los gustos claros. La guía de la demo de Inicio solo
  aparece con datos simulados; fuera la tarjeta de suscripción duplicada.
- **Auditoría de seguridad (fase 13)**: resultado en [beta.md](beta.md). Arreglado: detrás del proxy HTTPS el límite de
  peticiones se habría repartido entre todos los usuarios; ahora `TRUST_PROXY` lee la IP real. Tests nuevos de acceso
  a recursos ajenos (solicitudes y conversaciones).
- **Alta (D2/D3)**: título en display, «Cómo funciona» en tres pasos y el campo de texto del sistema de diseño
  (`TextField`, con etiqueta visible), también en el acceso local y en la eliminación de cuenta.
- **D5**: las etiquetas de la barra inferior crecen con el texto del sistema hasta 1,3×. Lista de comprobación para el
  teléfono: [D5-checklist-dispositivo.md](design/D5-checklist-dispositivo.md).

### Comprobaciones

- `pnpm test`: 36 ficheros y 360 tests OK (2 nuevos de configuración y más casos de acceso ajeno); lint y typecheck
  limpios.
- Vista web: Perfil con «Tus gustos» (Laura: 28 obras, 10 gustos y 3 disgustos) y la pantalla de alta.

### Siguiente paso

El titular pasa la lista D5 en el teléfono. Después: textos legales (condiciones y privacidad) y, con dominio y
servidor, la beta (ver beta.md).

## Entrega 2026-10-23 · D4 (ficha, estados vacíos y textos) y D5 (accesibilidad, primera pasada)

### Qué se ha hecho

- **Ficha de una obra**: cabecera a sangre con la imagen, el velo, la categoría y el título en display; sin la
  etiqueta técnica de tipo («artist»).
- **`ImageVeil` y `CategoryChipOnImage`**: componentes compartidos por la tarjeta y la ficha.
- **`EmptyState`**: icono, título, explicación y una acción, como en el sistema de diseño. Se usa al final del mazo de
  Inicio (conectar fuentes, con deshacer o recargar como secundaria) y en «Aún no hay almas gemelas».
- **Textos**: se retiran las referencias a fases ya terminadas (chat, fuentes, contactos, sesión de desarrollo y
  Premium).
- **Accesibilidad**: auditoría automática de los `Pressable`. La burbuja de reintento del chat y la cabecera con el
  perfil no tenían rol ni etiqueta; ahora sí. Los demás pulsables con rol leen su texto visible.

### Incidencia: disco lleno (resuelta)

- **Causa**: `scripts/web-screenshot.mjs` dejaba perfiles temporales de Edge en `%TEMP%` (unos 250 MB cada uno) y
  293 procesos sin interfaz vivos. En Windows, el lanzador de Edge termina enseguida y sus hijos quedan sueltos.
- **Efecto**: el disco llegó a 0 GB libres y se cayó la vista web. Metro (8091), la API y PostgreSQL siguieron bien y
  el registro de PostgreSQL no tiene errores de escritura.
- **Arreglo**: se borraron los 40 perfiles y se cerraron los procesos, con lo que quedaron 18 GB libres. El script cierra
  ahora los procesos por la ruta de su perfil y borra el perfil al terminar. Comprobado: tras una captura quedan
  0 procesos y 0 perfiles.

### Comprobaciones

- `pnpm test`: 36 ficheros y 358 tests OK; lint y typecheck limpios.
- Capturas reales: ficha de Vetusta Morla (foto de Commons, licencia CC BY-SA 4.0) y conversación de chat.

### Siguiente paso

Revisión en el teléfono (barra inferior, tarjeta y perfil); después, D5 con lector de pantalla y textos grandes en el
propio dispositivo.

## Entrega 2026-10-23 · observaciones del titular en el teléfono y D4 en el resto de pestañas

### Qué se ha hecho

- **Afinidad (`affinity-v4`)**: Clara tenía un 86 % global y ninguna categoría pasaba de 50. Ahora cada categoría se
  encoge hacia la calidad global de la pareja según su propia evidencia, así que la global queda siempre entre la menor
  y la mayor categoría. Laura ↔ Clara: global 86, categorías 85–87. Afinidades recalculadas; API y worker reiniciados.
- **Barra inferior**: ya no se solapa con los botones de Android (edge-to-edge); su altura suma el margen del sistema.
- **People**: abre en «Almas gemelas» (primer segmento). La invitación va arriba solo si aún no hay almas gemelas.
- **Categorías**: sin el nombre repetido y con títulos en Space Grotesk.
- **Perfil**: las acciones de cada fuente son pequeñas y van en fila (`Button size="small"`).
- `web-screenshot.mjs`: sesión de demo creada por la API y `--tabs` para varias capturas en una misma sesión.

### Comprobaciones

- `pnpm test`: 36 ficheros y 358 tests OK. Tests nuevos de v4: la global queda entre la menor y la mayor categoría, y
  el desacuerdo con evidencia llega a ~0.
- Lint y typecheck limpios.
- Capturas de Inicio, Personas, Categorías y Perfil en la vista web.
- **Pendiente de ver en el teléfono**: la barra inferior sobre los botones de Android (en la web no hay margen del
  sistema).

## Entrega 2026-10-23 · diseño D1 y D4 (sistema de diseño y primera aplicación en la app)

### Qué se ha hecho

- **Teléfono**:
  - la app de desarrollo (APK) conecta tras abrir en el cortafuegos de Windows los puertos 3100 y 8091 para redes
    privadas (acción del titular);
  - acceso sin Google con un código local de un solo uso para la cuenta real (`pnpm user:local` conserva los datos).
- **D1 · sistema de diseño «Noche de cine»** (`docs/design/design-system/`):
  - tokens oscuro y claro;
  - 44 componentes (38 de Material + MUI y 6 propios);
  - guía viva con Dev Mode y «Copiar como prompt»;
  - concepto de dos pantallas y 43 iconos propios.
- **D4 · en la app**:
  - tema con los tokens, oscuro por defecto;
  - Space Grotesk en titulares y cifras;
  - barra inferior con píldora;
  - tarjeta de recomendación a sangre con velo, categoría y motivo;
  - botones del mazo y botones en píldora;
  - perfil de persona con la cifra grande y barras por categoría.
- **Arreglo**: tras entrar (con código local o con Google), el inicio se quedaba cargando hasta recargar. La caché se
  vaciaba después de cambiar la sesión y se llevaba por delante la consulta `/v1/me`.
- `scripts/web-screenshot.mjs`: capturas de la vista web con Edge sin interfaz (DevTools), sin dependencias.

### Comprobaciones

- `pnpm test`: 36 ficheros y 357 tests OK; lint y typecheck limpios.
- Contraste AA calculado con la fórmula WCAG para todos los pares de tokens, en ambos temas.
- Capturas reales en la vista web: inicio con tarjeta y perfil de una alma gemela. La guía y el concepto se
  revisaron en oscuro y en claro.
- **Pendiente de comprobar en el teléfono**: el aspecto en el APK de desarrollo. La fuente se carga en JavaScript y no
  hace falta otro APK.

### Siguiente paso

- D4 en el resto de pantallas: Categorías, People con la fila de persona, Perfil con la tarjeta de fuente y los
  estados vacíos.
- D5: accesibilidad (lector de pantalla y tamaños) y revisión en el teléfono.

## Entrega 2026-10-22 · fase 14 (arranque en frío y prioridades del diagnóstico)

### Qué se ha hecho

1. **Recomendador por contenido** (bloque `content`, «porque te gusta X»):
   - relaciones públicas de Wikidata: saga, secuela, director, guionista, creador, autor, estudio, influencias y
     géneros (`catalog_relations`, migración 0014);
   - una consulta SPARQL por relación, porque la UNION tardaba 65 s y cada una por separado menos de 1,5 s;
   - en series se usa el creador y no el director, que en las series son los de cada episodio;
   - en música, artistas del mismo tipo (grupo o solista) con 2 géneros en común o influencias;
   - el bloque va antes de comunidad y explorar, y solo lo generan gustos claros (≥ 0,3); un disgusto nunca recomienda
     lo relacionado.
2. **Imágenes del catálogo real** desde Wikidata (P18 y P154) y Commons, con licencia libre y autoría. El job
   `enrich-catalog` del worker las añade cada 6 h y al arrancar.
3. **Ciudad opcional en el alta**: Nominatim, solo poblaciones; un nombre de calle o un texto inventado se rechazan.
   Se guarda aproximada.
4. **Invitaciones por enlace** (migración 0015):
   - código aleatorio de 10 caracteres, 30 días y 20 usos;
   - aceptar crea la amistad y abre el chat;
   - respetan bloqueos y datasets; la invitación propia no sirve.
5. **Diseño D0**: dirección y principios en docs/design/D0-direccion.md.
6. **CI**: GitHub Actions con PostGIS y Redis (lint, typecheck y tests); repositorio público, sin coste.
7. **Build de desarrollo local**: `expo-dev-client` y `pnpm android:build`, que genera un APK en este PC con el SDK y
   el JDK de Android Studio, sin EAS.

También: fusión de cuentas (la antigua queda vacía, no se ha borrado) y ciudad «Barcelona» en la cuenta real, deducida
de los lugares de su calendario y modificable en Perfil.

### Resultados reales con la cuenta del titular

| Métrica | Antes | Después |
|---|---|---|
| Recomendaciones | 3 (explorar) | **47** «porque te gusta X» |
| Objetos del catálogo real con imagen | 9 % | **55 %** del catálogo de entonces; +109 de los objetos nuevos |
| Trending | «sin ubicación» | «votos insuficientes» (falta gente en la zona) |

Ejemplos de recomendaciones:
- *2010* y *El resplandor*, por *2001: A Space Odyssey*;
- *The Cranberries*, por La Oreja de Van Gogh;
- Michael Jackson, por Beyoncé.

Endpoints comprobados por HTTP con una sesión temporal: recomendaciones con su motivo e imagen, crear invitación y
rechazo de la invitación propia.

### Comprobaciones

- `pnpm test`: 36 ficheros y 357 tests OK; lint y typecheck limpios.
- Tests nuevos:
  - algoritmo por contenido (3);
  - consultas y relacionados de Wikidata (2);
  - bloque «por contenido» de extremo a extremo (1);
  - invitaciones (4).

### Limitaciones conocidas

- La calidad de las relaciones musicales es irregular: Wikidata tiene pocas influencias y los géneros son amplios.
- Las fotos de restaurantes siguen con fallback: no hay fotos libres fiables de cada local.
- Sin otros usuarios reales, consenso, descubrimiento y Trending siguen vacíos. Las invitaciones son la vía.

### Siguiente paso

D1, el sistema de diseño, con los plugins (disponibles en la próxima sesión), e instalar el APK de desarrollo en el
teléfono.

## Entrega 2026-10-22 · fase 11E (Google Calendar)

### Qué se ha hecho

- **Google Calendar** va en el mismo consentimiento de «Continuar con Google»:
  - restaurantes, museos y teatros por la ubicación del evento;
  - conciertos y películas por el título, solo con un prefijo explícito;
  - guarda solo lo identificado como «conocido» (intención), sin preferencia y sin títulos de eventos.
- **Permiso compartido**: ni Calendar ni Books conectado en el alta revocan el permiso al desconectar. Revocarlo cerraría también la sesión de Google.
- **Mixcloud descartada**: sus condiciones solo permiten un uso personal y no comercial de la API.

### Comprobaciones

- `pnpm test`: 34 ficheros y 346 tests OK.
- `pnpm lint` y `pnpm typecheck` limpios.
- Prueba real con OSM y Wikidata sobre eventos de ejemplo: 6 de 10 planes identificados y ningún título guardado.
- **Validado con el calendario real** (2026-10-22):
  - 607 eventos leídos, 82 con ubicación y 23 lugares candidatos;
  - **5 identificados**: 3 restaurantes, un teatro y la Sagrada Familia (dos con 2 eventos);
  - 59 ubicaciones descartadas antes de buscar, casi todas reuniones en línea recurrentes;
  - 16 lugares sin coincidencia exacta en OSM;
  - ningún título de evento guardado.
- **Arreglo**: la vista web usa siempre la API de localhost y el móvil la IP de Metro, porque la IP local del .env caducaba.

### Fase 13 · comprobaciones y verificación de Google

- **§19 de la especificación**: añadidos los casos que faltaban. Un artista antiguo entra en Trending por votos de este año, y un voto duplicado desde otra fuente no cuenta dos veces. La afinidad simétrica es una decisión expresa del titular (affinity-v3).
- **Verificación de Google**: 2 de los 11 scopes de Data Portability son restringidos y requieren una evaluación CASA de pago. Producción los omite por defecto con `GOOGLE_RESTRICTED_SCOPES`. Preparado docs/google-verification.md.
- `pnpm test`: 34 ficheros y 347 tests OK; lint y typecheck limpios.

- **Fusión de cuentas** (2026-10-22): las 130 observaciones de la cuenta local antigua (Steam y Google) pasan a la cuenta de «Continuar con Google». La cuenta antigua queda vacía, sin borrar, y hay una copia en backups/. Ahora son 141 observaciones y 138 gustos.
- **Diagnóstico completo y fases de diseño**: docs/diagnostico-2026-10-22.md.

### Siguiente paso

Recomendador por contenido para el arranque en frío; después imágenes del catálogo real y la ciudad en el alta (docs/diagnostico-2026-10-22.md, §3).

## Entrega 2026-10-16 · fase 11D (AniList) y arreglo de Trakt

### Qué se ha hecho

- **Arreglo de Trakt**:
  - **Causa**: Cloudflare de Trakt responde 403 a cualquier User-Agent que contenga «Claude», y el worker usaba el del catálogo.
  - **Cambio**: ahora Trakt lleva su propio User-Agent.
  - **Resultado del sync real**: 3 títulos recibidos y 3 identificados, sin errores.
- **Google Books, comprobado con la cuenta real**: la API responde, pero las 10 estanterías están vacías (0 libros).
- **AniList**:
  - lee el anime y el manga del usuario: puntuaciones 1–100, favoritos, estados y fechas;
  - identificación exacta por AniList o MAL en Wikidata;
  - manga y novela ligera van a libros.
- La identificación por IDs externos acepta ahora AniList y MyAnimeList.
- `pnpm secret:set` acepta el formato actual de las claves de Trakt y también `ANILIST_CLIENT_ID` y `ANILIST_CLIENT_SECRET`.

### Comprobaciones

- `pnpm test`: 33 ficheros y 341 tests OK.
- `pnpm lint` y `pnpm typecheck` limpios.
- Consulta GraphQL contra listas públicas reales de AniList: OK.
- Identificación real en Wikidata:
  - IDs conocidos: OK;
  - una lista real de anime: 22 de 40 obras;
  - una lista de manga poco conocido: 9 de 60 por ID.
- **Validado con la cuenta real** (2026-10-16): sync de AniList con 3 obras recibidas y 3 identificadas, sin errores. Una por ID de AniList y dos por título exacto; 2 mangas y 1 anime.

### Siguiente paso

Crear la app de AniList y conectar. Después, Google Calendar (requiere la verificación de Google).

## Entrega 2026-10-15 · fase 11C (Google Books y Trakt)

### Qué se ha hecho

- **Google Books**:
  - lee las estanterías del usuario;
  - en el alta va dentro del consentimiento de «Continuar con Google»;
  - las cuentas ya creadas tienen una conexión aparte.
- **Trakt**:
  - valoraciones, vistos, favoritos y pendientes de cine y series, con PKCE;
  - el refresh token rotado se guarda en cada sync.
- **Identificación exacta en Wikidata**: Google Books por P675; Trakt por IMDb y TMDB.
- `pnpm secret:set` acepta `TRAKT_CLIENT_ID` y `TRAKT_CLIENT_SECRET`.

### Comprobaciones

- `pnpm test`: 32 ficheros y 335 tests OK.
- `pnpm lint` limpio.
- Consultas reales a Wikidata:
  - P675 `WXIoqjLSaaoC` → Q27102283;
  - tt0111161 → Q172241;
  - tt0903747 y TMDB 1396 → Q1079.
- **Sin validar con cuentas reales**: Books necesita activar la API y autorizar su URL de vuelta, y Trakt necesita que el titular cree la app.

### Siguiente paso

Conectar ambas fuentes con cuentas reales. Después, AniList.

## Entrega 2026-10-15 · fase 13 (preparación de la beta)

### Qué se ha hecho

- **Autenticación de producción**: «Continuar con Google» (OpenID Connect), sesiones con rotación y revocación, alta (mayoría de edad y condiciones) y eliminación de cuenta. Migración 0012.
- **App**:
  - botón de Google en el login;
  - vuelta `/auth`, que canjea el código;
  - pantalla de alta;
  - Perfil con «Cerrar sesión» y «Eliminar mi cuenta»;
  - renovación automática de la sesión.
- **Operación**:
  - `Dockerfile`, `docker-compose.prod.yml` y `.dockerignore`;
  - `pnpm db:backup` con rotación;
  - `apps/mobile/eas.json`;
  - [operations.md](operations.md) y [beta.md](beta.md).
- `pnpm setup` genera `AUTH_SECRET` (generado ya en el `.env` local).

### Comandos ejecutados y resultados (Windows 11, 2026-10-15)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **30 ficheros, 322 tests OK** (5 nuevos de auth: OIDC con claves locales y recorrido HTTP completo) |
| Vista web (API 3101 con `AUTH_SECRET`, web 8093) | Botón de Google visible. Código de un solo uso → alta → Perfil → «Eliminar mi cuenta» con confirmación → usuario, identidad y sesiones borrados en la BD → login. La vuelta de Google se simuló dejando el código en Redis; la verificación del ID token la cubren los tests |
| `docker build` | Imagen construida; se ejecuta como usuario `appinity` |
| `docker run` (producción) | Se niega a arrancar sin `AUTH_SECRET` y con `DEMO_MODE` |
| Pila `docker-compose.prod.yml` en local (puerto 3111) | Migraciones desde cero; `/health` en producción con BD, PostGIS, Redis y worker correctos; `/v1/dev/session` → 404; `/v1/me` → 401 |
| `pnpm db:backup` + `pg_restore` | Copia de 95 KB restaurada completa (13 migraciones, PostGIS) |

### Añadido después (mismo día)

- **Reutilización del refresh token**: un token ya rotado revoca la sesión entera. Migración 0013.
- **Recibos de Expo push**: los tokens dados de baja por FCM/APNs se desactivan.
- `pnpm test`: **30 ficheros, 325 tests OK**.

### Limitaciones

- El inicio de sesión con Google real no se ha probado: falta autorizar la URL de vuelta (paso del usuario) y, para el teléfono, un dominio HTTPS.
- Sin «Iniciar sesión con Apple» (iOS).

### Siguiente paso

Ver [beta.md](beta.md): dominio y servidor, verificación de Google, EAS y FCM.

---

## Entrega 2026-10-15 · fase 12C (notificaciones push, servidor)

### Qué se ha hecho

- **Migración 0011**: `push_tokens` y `notification_deliveries`.
- **Calendario y contenido**: frecuencia y zona horaria de cada persona; como mucho un resumen al día; contenido de
  recomendaciones no vistas y chats pendientes; sin nada nuevo no se envía.
- **Worker**: trabajo `send-digests` cada 30 min, con el emisor de Expo push (lotes, reintentos y desactivación de
  tokens no registrados).
- **API**:
  - `POST|DELETE /v1/me/push-tokens` (solo su dueño);
  - `GET /v1/me/notifications` (dispositivos y último resumen).
- **App**: el Perfil muestra el estado real y explica que en Android, con Expo Go, no hay push.

### Comandos ejecutados y resultados (Windows 11, 2026-10-15)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **29 ficheros, 317 tests OK**. Nuevos: 6 de integración (zonas horarias, frecuencias, tokens, deduplicación, desactivadas, otra zona horaria, DeviceNotRegistered) y 1 del emisor de Expo (lotes, 429, tickets) |
| `pnpm db:migrate` | 0011 aplicada |
| `npx expo install expo-notifications` | **Falló** (ENOENT de pnpm en Windows con Metro y la web abiertos). Lockfile restaurado; instalación verificada con `pnpm install --frozen-lockfile` |

**No se ha probado ningún envío real**: los tests usan un emisor simulado.

### Para recibir notificaciones reales en Android

1. `eas init` con tu cuenta de Expo (gratuito): crea el `projectId`.
2. Proyecto de Firebase y clave de cuenta de servicio FCM V1, subida a EAS (`eas credentials`).
3. Con Metro y la vista web parados: `pnpm --filter @appinity/mobile add expo-notifications`. Después, permiso en el
   alta y registro del token (`POST /v1/me/push-tokens`).
4. Build de desarrollo (`eas build --profile development --platform android`) e instalarla en el teléfono.

### Siguiente paso

Fase 13 (registro real y beta). En ella encaja la build de desarrollo que necesitan las compras (12B) y el push (12C).

---

## Entrega 2026-10-15 · fase 12B (Premium con RevenueCat, lado servidor)

### Qué se ha hecho

- **Migración 0010**: `entitlements` (por usuario, entitlement y entorno) y `revenuecat_events` (idempotencia).
- **Webhook** `POST /v1/webhooks/revenuecat`:
  - cabecera Authorization en tiempo constante;
  - sin duplicados;
  - eventos fuera de orden ignorados;
  - `EXPIRATION` retira el acceso; `CANCELLATION` no;
  - transferencias;
  - sandbox y producción por separado.
- **`GET /v1/me/premium`**: estado verificado en servidor.
- **Premium**: ranking de 200 almas gemelas (consenso siempre Top 50) y chat directo si su flag está activo.
- Flag `CHAT_SOULMATES_PREMIUM` (desactivado): chat con almas gemelas solo con Premium; con amigos, siempre.
- **App**: tarjeta Premium en Perfil con el estado real. Indica que aún no se puede comprar, sin simular nada.

### Comandos ejecutados y resultados (Windows 11, 2026-10-15)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **27 ficheros, 310 tests OK**. Nuevos: 7 de dominio (compra, duplicado, cancelación frente a caducidad, evento tardío, entornos, transferencia, otros eventos) + flag de chat Premium, y 3 HTTP (401/400, compra aplicada una vez, ranking de 200, entorno) |
| `pnpm db:migrate` | 0010 aplicada en la BD de desarrollo |

### Lo que tienes que configurar para probar una compra real (sandbox)

1. **RevenueCat** (plan gratuito hasta cierto volumen de ingresos; revisar sus condiciones antes de crear la cuenta): proyecto, apps iOS y Android y entitlement `premium`.
2. **App Store Connect** (Apple Developer Program, 99 $/año) y **Google Play Console** (pago único de 25 $): una suscripción
   (p. ej., `appinity_premium_monthly`) asociada al entitlement en RevenueCat.
3. **Webhook** en RevenueCat → URL pública de la API (`/v1/webhooks/revenuecat`). En local no hay URL pública: se
   necesitará un despliegue o un túnel. Cabecera Authorization = valor aleatorio largo, guardado con
   `pnpm secret:set REVENUECAT_WEBHOOK_AUTH`.
4. **Build de desarrollo** de la app (EAS) con `react-native-purchases`: Expo Go no admite compras.

Ninguno de estos pasos lo he hecho: implican cuentas y pagos que requieren tu decisión.

### Siguiente paso

12C (notificaciones push) o 13 (registro real y beta).

---

## Entrega 2026-10-14 · fase 11, paso 1 (Google ampliado: Play, pedidos y guardados)

### Qué se ha hecho

- Tres grupos nuevos de Google Data Portability **en el mismo consentimiento**:
  - biblioteca de Google Play (libros, juegos, películas y series);
  - pedidos y reservas de comida;
  - colecciones guardadas.
- Identificación:
  - apps de Play por su ID en Wikidata (P3418), solo videojuegos;
  - títulos limitados a su categoría;
  - lugares sin coordenadas mediante Nominatim y la regla OSM existente.
- Normalización y avisos honestos: los cancelados, las reservas futuras y los enlaces que no son lugares no cuentan como
  datos incompletos.
- Textos: manifest de Google y aviso «Renovar permiso» con los datos nuevos. `NOMINATIM_URL` en `.env.example`.

### Comandos ejecutados y resultados (Windows 11, 2026-10-14)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **25 ficheros, 294 tests OK** (12 nuevos de la fase 11; integración de Google ampliada a 11 grupos y 16 registros) |
| Prueba real (script local, servicios públicos) | Nominatim + Overpass: 3/3 lugares identificados (2 por dirección, 1 por nombre). La primera estrategia (nombre + dirección juntos) no encontraba nada y se cambió. Wikidata (consultas directas por `maxlag`): P3418 identifica Monument Valley y Clash Royale como videojuegos y deja fuera WhatsApp |

### Pasos para probarlo con tu cuenta

1. T1 (`pnpm api`) y T2 (`pnpm worker`): reinícialos con Ctrl+C y vuelve a lanzarlos (no hay migraciones).
2. T5: vista web del PC (`pnpm --filter @appinity/mobile web`, puerto 8092) → Perfil → Google → **«Renovar permiso»**.
   Marca los datos nuevos. Google no permite ampliar un permiso ya concedido; un usuario nuevo lo acepta todo de una vez
   al registrarse.
3. T2 (worker): espera a que Google prepare los exports. Verás líneas `[google] export play.library: …` con la
   estructura real, sin datos personales. Pégame esas líneas: sirven para confirmar el formato de `doc` en Play.

### Sync real con la cuenta del usuario (2026-10-15)

**115 evidencias de Google** (antes, 82):
- YouTube: 50 artistas o programas y 2 suscripciones.
- Maps: 33 reseñas y 1 sitio con estrella.
- **Colecciones guardadas: 29**, de 166 consultadas; el resto, en syncs posteriores por el tope de 150.
- Play: 9 apps, ninguna es un videojuego.
- Pedidos y reservas: Google rechaza exportarlos para esta cuenta, aunque concede el permiso.

Incidencias reales resueltas por el camino:
- `prompt=consent` rechazado por Google.
- Sin refresh token: se guarda el access token de 1 h.
- Ventana emergente sin vínculo (COOP): ahora es una página completa.
- 409 y 400 por grupo, sin bloquear el resto.
- `maxlag` persistente de Wikidata.
- Los exports se conservan al renovar.

Mejora de precisión tras el sync, con nombres reales:
- Nominatim por nombre solo acepta sitios concretos, no ciudades ni calles homónimas.
- Se busca sin el descriptor de marketing.
- Wikidata (P625) como segundo localizador.

Muestra de 7 lugares reales: de 2 a 3 identificados. El resto falla por títulos descriptivos de Google («Abandoned Village of Kayaköy»), sin un nombre exacto en los catálogos.

### Limitaciones

- Google no entrega refresh token: el acceso dura 1 h y los syncs automáticos posteriores requieren renovar el permiso. Pendiente de investigar.
- El formato interno de `doc` en Play no está documentado. Se contrastará con tu primer export real.
- Nominatim público solo vale para desarrollo y volúmenes pequeños.
- Pedidos y reservas solo existen si se usó «Pedir con Google» o «Reservar con Google».

### Siguiente paso

- Validar con tu export real.
- Después, otras fuentes según [source-candidates.md](source-candidates.md): APIs DMA europeas (requieren el alta del
  titular) y Twitch (condiciones por verificar).

---

## Entrega 2026-10-14 · fase 12A (Chat con match)

Adelantada a la fase 11 a petición del usuario (el chat es un núcleo de la app).

### Qué se ha hecho

- **Dominio** (`packages/ingestion/src/chat.ts`):
  - interés, match mutuo, aceptar o ignorar;
  - primer mensaje Premium (sin entitlement real: siempre 403 en la API);
  - mensajes con paginación, leído y «Visto»;
  - deshacer match; el bloqueo cierra el chat; la amistad aceptada lo abre;
  - límites de envío.
- **API** (`/v1/me/chats`):
  - `GET config`, `GET /` (bandeja);
  - `POST requests`, `POST direct`, `POST requests/:id/accept|ignore`;
  - `GET|POST :id/messages`, `POST :id/read`, `DELETE :id`;
  - el perfil público incluye `chat`;
  - 429 por límite.
- **App**:
  - **Personas → Chats** con aviso en la pestaña: solicitudes, fila de nuevos matches y conversaciones;
  - en el perfil: «Quiero hablar», «Aceptar y chatear» o «Enviar mensaje»;
  - pantalla «¡Es un match!»;
  - conversación: burbujas, enviando, reintento, «Visto», mensajes anteriores, sugerencia para romper el hielo;
    opciones para ver perfil, deshacer match y bloquear.
- **Migración 0009**: `message_requests`, `conversations`, `conversation_members`, `messages`. Incluye las
  conversaciones de las amistades ya aceptadas.
- Flags `CHAT_EARLY_ACCESS` (activado) y `CHAT_PREMIUM_DIRECT_MESSAGE` (desactivado) en `.env.example`.

### Comandos ejecutados y resultados (Windows 11, 2026-10-14)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **24 ficheros, 281 tests OK**. Nuevos: 15 de integración de chat (match, mutuo, ignorar sin revelar, otro dataset, amistad, flags, miembros, leído, idempotencia, paginación, límite por minuto, bloqueo, deshacer match, Premium inyectado solo en test, límite diario, gustos intactos) y 2 HTTP (config y 403 Premium; recorrido con 404 a quien no es miembro y bloqueo) |
| `pnpm db:migrate` (BD de desarrollo) | 0009 aplicada |
| Vista web propia (375×812, API 3101) | Marta muestra interés (API) → Laura ve la solicitud con aviso «1» en la pestaña → «Aceptar y chatear» → «¡Es un match!» → «Enviar mensaje» → mensaje enviado. Marta lo lee y responde (API): aparece solo en unos segundos con «Visto». Perfil de Àlex → «Quiero hablar» → «Interés enviado»; Àlex acepta (API) → nuevo match con anillo. «Deshacer match» con confirmación: desaparece para las dos (404 para Marta) |

### Pasos para probarlo en el teléfono

1. Reiniciar `pnpm api` y `pnpm mobile` (la migración 0009 ya está aplicada en la BD de desarrollo).
2. Como Laura (demo): Personas → Almas gemelas → abre a Teo → «Quiero hablar» → «Interés enviado».
3. Salir y entrar como Teo: Personas muestra el aviso. Chats → «Aceptar y chatear» → «¡Es un match!» → «Enviar mensaje».
4. Escribe un mensaje. Vuelve a Laura: la conversación aparece con el no leído; al abrirla, Teo verá «Visto».
5. En el chat, ⋮ → «Deshacer match» o «Bloquear» (con confirmación): la conversación desaparece para las dos.
6. Laura ya tiene un match nuevo con Àlex (de la verificación web) para probar el primer mensaje.

### Limitaciones

- Sin push (fase 12C): la bandeja se actualiza cada 15 s y la conversación abierta cada 4 s.
- Premium sin RevenueCat (fase 12B): el envío directo existe pero devuelve 403. No hay entitlement simulado.
- Sin moderación de mensajes ni adjuntos (solo texto). Los mensajes de conversaciones cerradas se conservan hasta un
  nuevo match o el borrado de la cuenta. Su política de retención queda para la fase 13.
- El teclado en Android/iOS (KeyboardAvoidingView) solo se ha visto en la web: pendiente de aceptación en dispositivo.

### Siguiente paso

Aceptación del chat en el teléfono. Después:

- 12B: Premium con RevenueCat. Necesita una cuenta y productos en las tiendas: no se contrata nada sin una tarea específica.
- 12C: push. Necesita un proyecto de Expo/FCM/APNs. El permiso se pedirá en el alta.
- Fase 11: fuentes, una por tarea. Por la regla de un único consentimiento, su conexión debe ofrecerse en el alta.

---

## Entrega 2026-10-14 · fase 10 (People y Friends)

### Qué se ha hecho

- **API:**
  - `GET /v1/me/friends`;
  - `POST /v1/me/friends/requests` y `…/:id/accept|reject`;
  - `DELETE /v1/me/friends/:userId`;
  - `GET|POST /v1/me/blocks` y `DELETE /v1/me/blocks/:userId`;
  - `POST /v1/me/reports`;
  - el perfil público incluye la relación (`friendship`);
  - ajuste `discoverableAsSoulmate`.
- **App:**
  - **Personas**: amigos con su afinidad, solicitudes recibidas y enviadas, personas bloqueadas y el flujo de contactos
    marcado como pendiente;
  - **perfil**: añadir, aceptar, cancelar o eliminar amistad; bloquear (con confirmación); reportar con motivo;
  - **Perfil**: «Aparecer como alma gemela».
- **Migración 0008**: `friendships`, `user_reports` y la columna de privacidad.

### Comandos ejecutados y resultados (Windows 11, 2026-10-14)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **23 ficheros, 264 tests OK**. Nuevos: 8 de integración (amistad, rechazo no revelado, aceptación cruzada, bloqueo y desbloqueo, reporte, privacidad del ranking, demo frente a cuentas reales) y 2 HTTP |
| Vista web propia (375×812) | Laura → Clara «Añadir amigo» → «Solicitud enviada». Clara acepta (API) y Laura la ve en Amigos (86 %). Bloquear con confirmación: Clara sale del ranking y de Amigos y aparece en «Personas bloqueadas». Al desbloquear, vuelve |

### Pasos para probarlo en el teléfono

1. Reiniciar `pnpm api` y `pnpm mobile` (migración ya aplicada).
2. Laura (demo) → Personas → Clara → «Añadir amigo».
3. Salir y entrar como Clara → Personas → «Solicitudes recibidas» → «Aceptar».
4. Volver a Laura: Clara en Amigos. En su perfil, «Bloquear» → «Confirmar»: desaparece y queda en «Personas bloqueadas».
5. Perfil → «Aparecer como alma gemela»: al desactivarlo, esa persona deja de salir en los rankings de las demás.

### Limitaciones

- Contactos: pendiente de identidad verificada (fase 13). Diseño en decisions.md.
- Los reportes se guardan, pero no hay panel de moderación (fuera del MVP).

### Siguiente paso

Fase 11: fuentes adicionales viables, una por tarea (Google Books, Apple Music, calendario…). Cada una requiere comprobar
antes sus condiciones de uso comercial.

---

## Entrega 2026-10-14 · fase 9 (Categories y feed continuo)

El usuario aceptó la fase 8 en el teléfono («Todo funciona correctamente») y pidió un mazo «que tienda al infinito, al
estilo de Tinder».

### Qué se ha hecho

- **Respaldos honestos** tras los bloques principales: comunidad, conservados y explorar, cada uno con su motivo
  (decisions.md).
- `POST /v1/me/recommendations/query`: paginación con la cola de la sesión en el cuerpo. Inicio la usa.
- **Categories**: cada categoría muestra recomendaciones (sin los descartes de Inicio) y el catálogo, con paginación
  continua.

### Comandos ejecutados y resultados (Windows 11, 2026-10-14)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **22 ficheros, 254 tests OK**. Nuevos: respaldos en orden y con motivo, objeto de la persona 51 solo como «comunidad», explorar solo lo no valorado y en orden estable, Categories sin descartes de Inicio y paginación por POST |
| Vista web propia (375×812) | Restaurantes como Laura: Lasarte, Alkimia y Cinc Sentits (consenso) y después «para explorar». Se corrigieron dos fallos: la lista pedía datos antes de recuperar la sesión, y «explorar» incluía restaurantes ya valorados (mal) por otras personas |
| Mazo de Inicio de Laura por la API, de 10 en 10 | 49 tarjetas en la sesión (antes 5): 2 de consenso (respetando lo que el usuario descartó y conservó en el teléfono), 13 de comunidad y 34 de explorar |

### Pasos para probarlo en el teléfono

1. Reiniciar `pnpm api` y `pnpm mobile`.
2. Laura (demo) → **Inicio**: después de las tarjetas de almas gemelas siguen «Lo valoraron muy bien N personas de
   APPINITY» y «Para explorar».
3. **Categorías** → Restaurantes: pestaña «Recomendado» (aparece Cinc Sentits aunque se descartara en Inicio) y
   «Catálogo». Al bajar se cargan más.

### Siguiente paso

Fase 10: People y Friends (solicitudes de amistad, bloqueo desde la app, privacidad de descubrimiento).

---

## Entrega 2026-10-14 · fase 8 (Home)

### Qué se ha hecho

- **API:**
  - `POST /v1/me/home/impressions` (NEW);
  - `POST /v1/me/home/actions` (descartar o conservar);
  - `POST /v1/me/home/undo`;
  - las tarjetas de `/v1/me/recommendations` incluyen `isNew`.
- **App:** Inicio muestra el mazo de recomendaciones con gestos, botones, NEW, motivo, enlace externo y estados de carga,
  error y vacío.

### Comandos ejecutados y resultados (Windows 11, 2026-10-14)

| Comando | Resultado |
|---|---|
| `pnpm db:generate -- --name=home_actions` | `0007_home_actions.sql`: dos tablas nuevas (revisado) |
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK (incluida la app) |
| `pnpm test` | **22 ficheros, 249 tests OK**. Nuevos: 4 de integración (descartar, deshacer, conservar, NEW, sin efecto en gustos ni afinidades, autorización) y 2 HTTP |
| Vista web propia (API en 3101 y web en 8093, 375×812) | Como Laura: Merlí con NEW y «2 de tus almas gemelas lo valoraron muy bien». Descartar con botón y con gesto (eventos de ratón reales), deshacer y conservar. Tras recargar, Merlí (descartada) no vuelve y Lasarte (conservada) sí. Sin errores de consola. Se corrigieron dos fallos: el mazo no se reiniciaba al cambiar de usuario, y la tarjeta de fondo se leía con el lector de pantalla (ahora es un borde decorativo) |

### Pasos para probarlo en el teléfono

1. Reiniciar `pnpm api`, `pnpm worker` y `pnpm mobile` (las migraciones ya están aplicadas).
2. Entrar como **Laura (demo)** → **Inicio**: tarjetas de Merlí, Lasarte, Alkimia, Fundació Miró y Cinc Sentits, con NEW
   la primera vez.
3. Deslizar a la izquierda (o «Descartar»), «Deshacer» y deslizar a la derecha (o «Conservar»).
4. Cerrar Expo Go y volver a abrir: lo descartado no aparece; lo conservado sí.
5. Entrar como **Àlex (demo)**: Lasarte como «Muy bien valorado en tu zona».

### Limitaciones

- Verificado en la vista web, no en el teléfono. El gesto se probó con eventos de ratón; falta probarlo con el dedo.
- Deshacer actúa sobre la última acción vigente en el servidor. En la app solo se ofrece para acciones de la sesión.

### Siguiente paso

Aceptación en el teléfono. Después, fase 9: Categories (recomendaciones por categoría, sin aplicar los descartes de
Home).

---

## Entrega 2026-10-14 · fase 7 (recomendador y Trending local)

### Qué se ha hecho

- **Motor `recommendation-v1`:**
  - consenso del Top 50 (una persona = un voto);
  - descubrimiento atribuido a una persona muy afín;
  - Trending con votos explícitos de la zona fechados este año;
  - mezcla 7/2/1 que cede huecos sin inventar apoyos.
- **Filtros:** conocidos, descartes de Home (tabla nueva `home_dismissals`), lo ya mostrado en la sesión, lugares
  fuera del radio y eventos terminados.
- **API:** `GET /v1/me/recommendations?limit&category&exclude&context`. Cada tarjeta incluye su motivo verificable,
  sin historiales ni ubicaciones ajenas.
- **Demo:** las personas sintéticas combinan la actividad de varias personas para que haya algo que recomendar.

### Comandos ejecutados y resultados (Windows 11, 2026-10-14)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **22 ficheros, 243 tests OK**. Nuevos: 5 del motor (consenso, descubrimiento, Trending, mezcla, año por zona horaria), 7 de integración y 2 HTTP. Los de integración usan 52 almas gemelas sintéticas y votantes dentro y fuera de la zona. Comprueban que la persona 51 no influye, que conocidos, descartes y lugares lejanos quedan fuera y que descartar no cambia los gustos. También cubren Trending: zona, año del voto y no del sync, estreno, cambio de año en Europe/Madrid y falta de ubicación |
| `pnpm db:migrate` + `pnpm db:seed` (dos veces) | Seed idempotente. Laura: Merlí, Lasarte, Alkimia, Fundació Miró y Cinc Sentits (consenso). Marta: 5 de consenso y 2 de descubrimiento vía Clara. Àlex: Lasarte como Trending (5 votantes de la zona en 2026, 3 altos). Cuenta real: 0 (sin ubicación ni personas con quien compararse) |

### Limitaciones

- Sin pantalla: la API está lista para Home (fase 8) y Categories (fase 9).
- Sin recomendación por similitud de contenido como último recurso: si no hay candidatos, la lista queda vacía o
  corta. No se rellena.
- Parámetros sin calibrar con usuarios reales.

### Siguiente paso

Fase 8: Home con carrusel (descartar, conservar, deshacer, NEW e impresiones).

---

## Entrega 2026-10-13 · fase 6 (Top 50 de almas gemelas)

### Qué se ha hecho

- **Ranking** de almas gemelas: Top 50 con orden estable, sin el propio usuario, sin bloqueos en ninguna dirección y
  solo personas elegibles del mismo dataset.
- **Perfil público mínimo** con afinidad global y por categoría (NULL como raya), sin historial.
- **API:** `GET /v1/me/soulmates`, `GET /v1/people/:id` y `GET /v1/me/affinities/:id` (ahora respeta los bloqueos).
- **App:** la pestaña Personas muestra el ranking. Al tocar una persona se abre su perfil.
- **Tabla `user_blocks`** (migración `0005_user_blocks`).
- **`affinity-v2`:** la evidencia repartida entre categorías se suma (decisions.md).
- **7 personas sintéticas** en la demo, con actividad derivada de la de las existentes.

### Comandos ejecutados y resultados (Windows 11, 2026-10-13)

| Comando | Resultado |
|---|---|
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK (incluida la app) |
| `pnpm test` | **20 ficheros, 225 tests OK**. Nuevos: ranking con 12 y 70 perfiles sintéticos comparado con el cálculo exhaustivo, bloqueos en ambas direcciones, cuentas suspendidas, orden estable, perfil sin historial, ranking de la demo y evidencia repartida (v2) |
| `pnpm db:migrate` + `pnpm db:seed` en la BD de desarrollo | 13 personas de demo, 27 syncs, 30 parejas con afinidad. Laura → Clara 85,94; Teo 48,66; Pau 22,95; Jordi 22,24. Marta → Iris 76,88. Àlex → Leo 70,95 |
| Vista web propia (API en 3101 y web en 8093, 375×812) | Personas: ranking con avatar, país, categorías comparadas y cifra. Perfil: cifra global y 8 categorías con «—». Se corrigió un texto que ensanchaba la tarjeta. Sin errores de consola. Servidores detenidos al terminar |

### Cambio pedido por el usuario: affinity-v3

Lo que solo conoce una de las dos personas ya no cuenta (ni sus gustos ni sus disgustos). Se elimina la cobertura y la
global pondera por la evidencia en común, así que la afinidad pasa a ser simétrica (decisions.md). Tests reescritos para
comprobarlo; **226 tests OK**. Demo recalculada: el orden no cambia (Clara 85,94; Teo 48,66; Jordi 23,62; Pau 22,95).

### Pasos para probarlo (usuario)

1. Reiniciar `pnpm api` y `pnpm worker` (las migraciones y el seed ya se aplicaron en la BD de desarrollo).
2. En el teléfono, entrar como **Laura (demo)** → pestaña **Personas**: Clara primera, Teo, Pau y Jordi.
3. Tocar a Clara: afinidad global y por categoría; las categorías sin datos muestran «—».
4. Entrar como **Sam (demo)**: Personas indica que aún no hay almas gemelas (sin cifras inventadas).

### Limitaciones

- Sin gestión de bloqueos en la app (fase 10) ni ajuste de privacidad «aparecer en almas gemelas».
- Validado en la vista web, no en el teléfono.

### Siguiente paso

Aceptación en el teléfono. Después, fase 7: recomendador (70/20/10) y Trending local.

---

## Entrega 2026-10-13 · fase 5 (afinidad direccional versionada)

### Qué se ha hecho

- **Motor `affinity-v1`** (`packages/algorithms/src/affinity.ts`): la fórmula V1 de §11 con un ajuste de calibración
  documentado. Determinista y sin IA generativa.
- **Tablas** `user_affinities` y `category_affinities` (migración `0004_affinities`) por pareja ordenada, versionadas.
- **Recálculo** (`packages/ingestion/src/affinities.ts`):
  - solo usuarios elegibles y del mismo dataset;
  - prefiltro exacto;
  - parcial tras cada sync con cambios o al borrar lo importado de una fuente;
  - completo cada día y al terminar el seed.
- **API** `GET /v1/me/affinities/:userId`: afinidad propia hacia otra persona, sin historiales.
- `pnpm db:generate` volvía a fallar con drizzle-kit 0.31 (no exporta `bin.cjs`) y con `--`. Corregido.

### Comandos ejecutados y resultados (Windows 11, 2026-10-13)

| Comando | Resultado |
|---|---|
| `pnpm db:generate -- --name=affinities` | `0004_affinities.sql`: dos tablas con sus restricciones (revisado) |
| `pnpm lint` / `pnpm typecheck` | 0 errores / OK |
| `pnpm test` | **19 ficheros, 216 tests OK**. Nuevos: 12 del motor (perfiles sintéticos), 7 de integración (elegibilidad, NULL, 0, direccionalidad, prefiltro frente a cálculo exhaustivo, recálculo parcial, datasets separados) y 3 HTTP |
| `pnpm db:migrate` en la BD de desarrollo + recálculo | Demo: 5 usuarios elegibles. Solo Laura y Jordi comparten preferencias (2 películas): 22,24 en un sentido y 22,76 en el otro. Cuenta real: sola en su dataset, sin parejas |

### Limitaciones

- La demo apenas tiene preferencias en común: para el Top 50 (fase 6) hará falta ampliarla con personas sintéticas.
- Sin bloqueos todavía (fase 10). Parámetros sin calibrar con usuarios reales.
- Sin pantalla propia: el ranking y el perfil con afinidades llegan con las fases 6 y 10.

### Siguiente paso

Fase 6: ranking Top 50 (excluye bloqueos y al propio usuario; orden estable) y personas sintéticas para la demo.

---

## Entrega 2026-10-13 · fase 4 (YouTube y YouTube Music)

El usuario autorizó seguir con las siguientes fases mientras no estaba (2026-10-13).

### Qué se ha hecho

- **Mismo consentimiento de Google, 8 grupos:** se añaden `myactivity.youtube`, `youtube.music` y
  `youtube.subscriptions`. Ficha verificada en la documentación oficial (integration-capabilities.md).
- **Lectura del export:** reproducciones de Mi actividad (URL `/watch?v=` con canal, sin anuncios; los títulos no se
  usan ni se guardan), suscripciones y biblioteca en CSV (parser RFC 4180 propio). Lo que no se lee (HTML, audio,
  música subida) ni se descomprime.
- **Identificación:** canales por su ID en Wikidata (P2397), en lotes; artistas «Topic» y de la biblioteca por nombre
  exacto, solo músicos. Podcasts por su canal.
- **Agregación por artista o programa**, fusionando el canal oficial y el «Topic». Preferencia por frecuencia relativa
  al propio usuario (log1p y p95), desde 3 escuchas.
- **Permisos nuevos:** la API indica cuántos permisos faltan en cada conexión y la app pide renovar el de Google.
- **Worker:** progreso de la identificación de canales y desglose de lo no importado, sin nombres.

### Comandos ejecutados y resultados (Windows 11, 2026-10-13)

| Comando | Resultado |
|---|---|
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK (paquetes, tests y app móvil) |
| `pnpm test` | **16 ficheros, 194 tests OK**. Nuevos: 9 unitarios de YouTube (CSV, extracción, límites, fusión, Wikidata, mapper), comprobaciones de YouTube en la integración de Google y 1 HTTP (permisos que faltan) |
| Identificación contra Wikidata real | Radiohead, The Beatles y Queen por su canal oficial (0,95); The Joe Rogan Experience y 99% Invisible como podcasts; Rosalía y Bad Bunny por nombre. Detectado y corregido: nombres solo en la etiqueta común `mul` |

No se ha probado la vista de la app en la web: la API del usuario seguía con la versión anterior y no se detienen sus
procesos. Se comprobó con el typecheck de la app.

### Incidencia con la cuenta real (2026-10-13)

Al pulsar «Renovar permiso», Google rechazó la petición: «Incremental auth is not allowed for the requested scopes»
(`Error 400: invalid_request`). Data Portability no admite añadir grupos a una autorización existente. Corregido: al
renovar con permisos nuevos se libera antes la autorización anterior y se piden los 8 grupos (decisions.md). Test de
integración añadido (12 en el fichero de Google).

### Validación pendiente (usuario, con su cuenta)

1. En Google Cloud, añadir los 3 permisos nuevos a la pantalla de consentimiento (README).
2. Reiniciar `pnpm api` y `pnpm worker`.
3. Desde la vista web del PC, pulsar «Renovar permiso» en Google y marcar los datos nuevos.
4. Pegar las líneas `[google] export myactivity.youtube …` y `[google] myactivity.youtube: …` del worker.

### Limitaciones

- Formato real sin comprobar: si Mi actividad incluye las escuchas de YouTube Music y si el JSON llega junto al HTML.
- Cobertura de Wikidata: solo ~570 podcasts tienen su canal de YouTube; muchos canales quedarán sin identificar.
- Confianzas y parámetros sin calibrar.

### Siguiente paso

Validar con la cuenta real. Después, fase 5: afinidad direccional versionada.

---

## Entrega 2026-10-09 · fase 3 (Google Data Portability: valoraciones y lugares)

Rama `fase-3-google` (basada en `especificacion-fuentes`), commit `7870721`, PR rferrermontesinos/appinity-claude#6.

### Qué se ha hecho

- **Ficha verificada** en la documentación oficial (ver integration-capabilities.md). Cuatro condiciones cambiaron el
  diseño:
  - el proyecto necesita cuenta de facturación;
  - los scopes no se combinan con openid/email, así que no hay identidad de cuenta;
  - los datos no traen identificadores ni categorías;
  - en modo de pruebas, Google solo vuelve a `localhost` y el permiso dura 7 días.
- **Adapter `profile/google-portability`:**
  - OAuth con PKCE y solo los 5 grupos que se importan;
  - un export por grupo, con el id del trabajo guardado cifrado antes de esperar;
  - lectura tolerante de los ZIP (GeoJSON y JSON documentados) sin guardar el texto de las reseñas;
  - mapper `google-portability-v1`, reintento de exports fallidos y límites de 24 h y de acceso único.
- **Identificación de catálogo:** `OsmPlaceIdentifier` (OpenStreetMap, lugares clasificados por etiquetas) y
  `WikidataWorkIdentifier` (obras por etiqueta exacta y tipo). Lo ambiguo no se importa y se informa.
- **Pipeline:** exports aplazados sin gastar reintentos (`pending` + `moveToDelayed`), estado cifrado durante el sync
  (`saveState`), instantánea por grupo (`snapshotKinds`) y errores parciales no bloqueantes.
- **Renovación** del permiso sobre la misma conexión, sin perder lo importado.
- **Piezas genéricas recuperadas de `fase-3`** (TMDb descartada):
  - credenciales por usuario cifradas;
  - `state` en el callback;
  - revocación en el proveedor (`providerRevocation`) y de sesiones huérfanas.
- **App:**
  - ayuda de conexión de Google;
  - aviso para conectar desde la vista web del PC en desarrollo;
  - botón «Renovar permiso»;
  - aviso de revocación;
  - tarjeta «Créditos y fuentes de datos» con la atribución de OpenStreetMap.
- **Configuración:** `pnpm secret:set GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET`, variables en `.env.example` y
  `fflate` 0.8.3 para leer los ZIP.

### Comandos ejecutados y resultados (Windows 11, 2026-10-09)

| Comando | Resultado |
|---|---|
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK (paquetes, tests y app móvil) |
| `pnpm test` | **15 ficheros, 173 tests OK** (93 unitarios, 80 de integración). Nuevos: 23 unitarios de Google (OAuth, archivo, máquina de estados, mapper, OSM y Wikidata, casos reales de OSM), 10 de integración (aplazamiento, evidencia, instantánea por grupo, renovación, revocación) y 4 HTTP (flujo con `state` y `code`, cancelación, revocación) |
| `npx expo export --platform android --platform ios` | Bundles generados |
| Vista web de desarrollo (8092, 375×812) | Perfil → «Créditos y fuentes de datos» con OpenStreetMap; sin errores de consola |
| Identificadores contra los servicios reales (OpenStreetMap y Wikidata) | Museu Picasso, Can Culleretes y Sagrada Família (basílica, por contención) identificados; Breaking Bad, Casablanca, Moana, Radiohead, OK Computer → Radiohead, Hades y Cien años de soledad identificados. Detectado y corregido: la consulta a Overpass se truncaba en zonas densas y los monumentos patrimoniales no se clasificaban |
| Endpoints reales de Google sin credenciales | `initiate`, `accessType:check` y `authorization:reset` → 401; `token` con un cliente falso → `invalid_client`. Coincide con el tratamiento del cliente |

### Validación pendiente (usuario, con su cuenta)

Guía paso a paso en el README, «Conectar tu cuenta de Google»:
1. Crear el proyecto de Google Cloud, con cuenta de facturación, la API habilitada, el consentimiento en pruebas con tu
   Gmail y los 5 scopes, y un cliente web con la URI de redirección.
2. Guardar el ID y el secreto con `pnpm secret:set`.
3. Reiniciar `pnpm api` y `pnpm worker`.
4. Conectar desde la vista web del PC.

Al terminar el export, las líneas `[google] export …` del worker muestran la estructura real del archivo, sin datos
personales. Con ellas se confirma o corrige el formato documentado (escala de las estrellas de la Búsqueda, presencia
de fechas y de identificadores).

### Primer export real (2026-10-09, cuenta del usuario)

El usuario creó el proyecto de Google Cloud y conectó su cuenta desde la vista web del PC. El primer intento dio
`Error 403: access_denied` porque la cuenta no estaba en la lista de usuarios de prueba; se resolvió añadiéndola, y la
solución está documentada en el README.

Resumen de estructura de `maps.reviews`, sin datos personales:
- Archivos: `Portability/Maps (your places)/Reviews.json` (59.841 bytes) y `Portability/archive_browser.json`
  (índice del archivo, sin registros).
- 75 reseñas leídas y 7 descartadas por datos incompletos.
- Claves: `Comment`, `date`, `five_star_rating_published`, `google_maps_url`, `location`, `questions`,
  `review_text_published`. Coinciden con la documentación, salvo `Comment`, que no figura en ella.
- **Diferencia con la documentación:** los enlaces de Maps no usan `?cid=` sino `/maps/place//data=…`. Se añadió la
  lectura del CID del lugar en ese formato (`!1s0x…:0x<CID>`), que pasa a ser el id del registro y un identificador
  `google_maps:cid` del objeto. Al resumen se añadieron los motivos de descarte y un patrón de URL más detallado (sigue
  sin datos).
- Resto de grupos: `maps.starred_places` (`Saved Places.json`, 1 sitio leído y 1 descartado, enlaces `?cid=`).
  Los tres grupos de la Búsqueda llegan **vacíos** (solo `archive_browser.json`): la cuenta no tiene valoraciones en
  la Búsqueda. Su formato real sigue sin comprobarse.

**Incidencia durante la identificación.** La primera ejecución falló con «OpenStreetMap (Overpass) no responde». No fue
por el Ctrl+C accidental del usuario, que ocurrió después, sino por el ritmo de consultas:
- La instancia pública da 4 huecos por IP y cada consulta bloquea el suyo unos 25 s (comprobado en `/api/status`).
- El identificador consultaba cada 1,1 s, agotó los huecos y se rindió tras tres 429.

Corregido:
- Ante un 429, el identificador lee `/api/status`, espera al siguiente hueco y pasa a un ritmo sostenible (una consulta
  cada 6,5 s).
- Si OSM o Wikidata siguen sin responder, el sync se **aplaza 10 minutos** en vez de fallar. Los exports de Google
  siguen disponibles 14 días y lo ya identificado queda en la caché del worker.
- El worker indica el motivo de cada espera.

Con este ritmo, identificar 75 lugares tarda unos 8 minutos la primera vez.

**Segunda incidencia: 20 minutos sin mensajes.** El ritmo anterior no bastó. Medido el 2026-10-09 en `/api/status`:
- Cada consulta bloquea su hueco **unos 60 s** aunque dure 5 s.
- El balanceador alterna dos servidores, con 4 y 2 huecos, así que `/api/status` puede indicar huecos libres que el
  otro servidor no tiene.
- En horas de carga, la mitad de las consultas devuelven 504 (servidor ocupado).

El worker identificaba los lugares de uno en uno y sin mostrar progreso. Además, Ctrl+C no lo detenía: cerraba `pnpm`,
pero el proceso de Node seguía en segundo plano esperando a que terminara el sync.

Corregido:
- **Consultas por lotes.** Una consulta para hasta 25 lugares; un separador `make sep i=<n>` entre los resultados de
  cada lugar permite repartirlos. Medido: 25 lugares en 26 s con una sola consulta; 75 lugares, en unas 3.
- **Reintentos.** Ante un 429 o 504 se reintenta tras 15 s, 30 s, 60 s y después cada 2 min (más si `/api/status` lo
  pide). Se repite también una respuesta incompleta (`runtime error` o separadores ausentes). Tras ~10 minutos sin
  respuesta, el sync se aplaza.
- **Progreso en el worker.** Por ejemplo, `[google] maps.reviews: 25/75 lugares consultados`,
  `[catálogo] OpenStreetMap ocupado (HTTP 504); reintento 1/7 en 15 s` y `… 68 de 75 identificados`.
- **Ctrl+C** deja de pedir trabajos, devuelve el sync en curso a la cola (se retoma al arrancar) y sale en unos
  segundos. Un segundo Ctrl+C sale de inmediato.

Prueba real con lugares públicos: Sagrada Família, Museu Picasso y Museo del Prado identificados en una sola consulta
(11 s). Casa Batlló y el Mercado de San Miguel no se identifican por cómo están etiquetados en OSM; se revisará con el
resultado del export real.

### Resultado del primer sync (2026-10-09)

`partial (+21 ~0 =0 -0, 3 errores parciales)`. Lo importado, sin nombres:
- 20 reseñas: 18 restaurantes y 2 lugares culturales; 16 con nombre idéntico (confianza 0,95) y 4 sin palabras
  genéricas (0,85).
- Las estrellas se convierten como se esperaba: 5 → +1, 4 → +0,5, 3 → 0, 2 → −0,5. Conocido y consumido = confianza
  de la identificación.
- El sitio guardado es un lugar cultural: conocido 0,95, consumido 0 y preferencia NULL.
- Avisos: 55 de 75 reseñas sin identificar, 7 reseñas y 1 sitio guardado con datos incompletos (sin nombre).

**Identificación revisada.** El 27 % de reseñas identificadas obligaba a distinguir lo que APPINITY no usa (hoteles,
tiendas, parques) de lo que falla. Cambios:
- La consulta trae todos los lugares con nombre y alguna clave de comercio o servicio (`amenity`, `shop`,
  `tourism`, `leisure`…), con una búsqueda por lugar en vez de tres. Es más rápida: 15 s frente a 23 s para 25
  lugares.
- Cada lugar no identificado tiene un motivo:
  - **fuera de categoría**, con una etiqueta genérica: alojamiento, tienda, mercado, parque…;
  - **sin coincidencia**;
  - **ambiguo**.

  El aviso de la app lo separa: «N son de lugares fuera de las categorías de APPINITY (…) y M no se pudieron
  identificar con seguridad». El worker muestra el desglose.
- Si lo que mejor coincide es de otra categoría (p. ej. un hotel), no se importa, aunque otro elemento coincida peor:
  se prefiere perder una reseña a etiquetar un hotel como restaurante.
- Casa Batlló (`historic=heritage` + `tourism=artwork`) se clasifica ya como lugar cultural.
- El resumen del export incluye la forma de los registros descartados (`skippedShapes`: solo claves y estado de las
  coordenadas), para saber por qué 7 reseñas llegan sin nombre.

Prueba real con 8 lugares públicos en una consulta (6 s):
- Identificados: Sagrada Família, Museu Picasso, Museo del Prado, Casa Batlló y Can Culleretes.
- Fuera de categoría: el Mercado de San Miguel (mercado) y El Corte Inglés (tienda).
- Sin coincidencia: el Hotel Arts, que en OSM se llama «Hotel Arts» y no «Hotel Arts Barcelona».

Se descartó ignorar partículas como «de»: hacía que «Museu de la Sagrada Família» ganara a la basílica.

Los cambios se aplican en el siguiente export. Google permite uno por grupo cada 24 h: desde el 2026-10-10 hacia las
12:20 (hora local), con el sync diario automático o con «Sincronizar».

Comprobaciones tras los cambios: `pnpm lint` 0 errores, `pnpm typecheck` OK y `pnpm test` con 15 ficheros y
**181 tests OK**. Nuevos: lotes, separadores y reintentos de Overpass, motivos de no identificación, casos reales de
etiquetado y resumen sin nombres.

### Segundo export real (2026-10-13)

`partial (+0 ~0 =21 -0, 3 errores parciales)`: las mismas 21 evidencias, sin cambios (idempotencia comprobada con
datos reales). Desglose de `maps.reviews`:
- 20 de 75 identificadas;
- 6 fuera de categoría: tienda 3, alojamiento 1, ocio nocturno 1, mercado 1;
- 49 sin coincidencia.

`skippedShapes` confirma que las 8 descartadas (7 reseñas y 1 sitio guardado) **no traen `location`** y tienen
coordenadas 0,0. Solo conservan el enlace y la fecha. No hay forma de identificarlas y se siguen descartando.

Cambios para entender y reducir las 49 sin coincidencia:
- **Descriptor de Google.** Se compara también la parte anterior a un separador: «Can Pep - Tapas Bar» y «Can Pep |
  Cocina mediterránea» coinciden con «Can Pep» (0,85).
- **Diagnóstico sin nombres.** Cada lugar sin coincidencia indica qué hay cerca:
  - nada con nombre;
  - solo otros lugares;
  - un restaurante o lugar cultural a ≤ 30 m con otro nombre (probablemente el mismo sitio).

  Si predomina este último caso, el siguiente paso sería una regla de proximidad con confianza baja. Se decidirá con el
  próximo export (desde el 2026-10-14), no a ciegas.

Comprobaciones: `pnpm lint` 0 errores, `pnpm typecheck` OK y `pnpm test` **183 tests OK**.

### Tercer export real (2026-10-13, con los permisos de YouTube)

`maps.reviews`: 21 de 75 identificadas; 7 fuera de categoría; 47 sin coincidencia (4 sin lugares cerca, 17 solo con
otros lugares y **26 con un restaurante o lugar cultural a ≤ 30 m con otro nombre**). Se añade la regla de nombre
parecido a ≤ 30 m (decisions.md); su efecto se verá en el siguiente export.

### Bloqueos y puntos declarados

- **Cuenta de facturación de Google Cloud:** obligatoria para activar la API, aunque esta no tenga coste publicado.
  Decisión del usuario.
- **Formato real del export:** confirmado para Maps (reseñas y sitios guardados). Los grupos de la Búsqueda llegaron
  vacíos en la cuenta del usuario: la escala de «Review Star Rating», los pulgares y la presencia de identificadores
  siguen sin comprobarse con datos reales.
- **Producción:**
  - verificación de Google (anual);
  - auditoría CASA si algún grupo es restringido;
  - encaje de APPINITY en el caso de uso aprobado de Data Portability;
  - URL de vuelta HTTPS;
  - instancia propia o de pago de Overpass.
- **Sin identidad de cuenta:** no se puede impedir que dos usuarios vinculen la misma cuenta de Google. Riesgo bajo; la
  autenticación de producción (fase 13) puede mitigarlo con el login de Google.

### Limitaciones

- En desarrollo el permiso caduca a los 7 días: hay que renovarlo desde la vista web del PC.
- Las confianzas de identificación y los parámetros del mapper están sin calibrar.
- Sin imagen propia: las tarjetas usan el fallback de su categoría salvo que el objeto exista en la instantánea de
  Wikidata (decisión del usuario).
- `saved.collections` (colecciones de la Búsqueda) no se importa todavía: no trae coordenadas ni tipo.

### Siguiente paso

1. Con el siguiente export (desde el 2026-10-14), revisar el desglose de «sin coincidencia» y decidir si hace falta
   una regla de proximidad.
2. Aceptación del usuario en la app.
3. Fase 4: YouTube y YouTube Music con el mismo consentimiento.

---

## Revisión de fuentes · 2026-10-08

Rama `especificacion-fuentes` (basada en `fase-2`), commit `14a1a0f`, PR rferrermontesinos/appinity-claude#5.

### Qué se ha hecho

- **Vuelta a la fase 2.** Se descartó TMDb por sus condiciones no comerciales. La PR
  rferrermontesinos/appinity-claude#4 está cerrada sin fusionar; la rama `fase-3` se conserva como referencia. La base
  local no tenía datos ni token de TMDb.
- **Revisión de más de 60 plataformas**, entre 6 y 13 por categoría. Incluye todas las propuestas por el usuario
  (Netflix, Tripadvisor, DICE, Epic, Glovo, Uber Eats, Just Eat, Filmaffinity, Letterboxd, Spotify, Google, Maps,
  Gmail, Google Podcasts, Disney+, Prime Video, Movistar+, Filmin, Stremio, Xbox, Resident Advisor, Podimo,
  Apple Podcasts, TheFork) y las de la especificación inicial. Resultado en [fuentes-de-datos.md](fuentes-de-datos.md),
  con veredicto, condiciones y enlaces.
- **Especificación 1.1:**
  - §9 rehecho;
  - permisos solo en el registro (§14);
  - licencia comercial también para el catálogo (§6);
  - Trending con las fuentes nuevas (§13);
  - política de Google (§17);
  - nuevas fases 3 y 4 (§18).
- **App:** la lista de fuentes «Próximamente» ya no anuncia TMDb ni Last.fm. Muestra Google (fases 3–4), Google Books,
  Apple Music y Calendario (fase 11).

### Comandos ejecutados y resultados (Windows 11, 2026-10-08)

| Comando | Resultado |
|---|---|
| Consulta a la base local (conexiones, credenciales, observaciones, objetos e imágenes de TMDb) | 0 en todas: nada que borrar |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK (paquetes, tests y app móvil) |
| `pnpm test` | **12 ficheros, 136 tests OK** (la base de la fase 2, con la expectativa de fuentes previstas actualizada) |

### Bloqueos y decisiones pendientes del usuario

- **Google Cloud (fase 3):** hace falta un proyecto de Google Cloud con la Data Portability API activada, una pantalla
  de consentimiento en modo de pruebas y tu cuenta como usuario de prueba. Es gratuito y lo debe crear el titular; se
  guiará paso a paso al empezar la fase.
- **Producción:** verificación de Google y, si algún grupo es restringido, auditoría CASA anual (coste aproximado de
  540 a 4.500 USD al año).
- **Catálogo audiovisual:** decidir si se licencia un catálogo comercial (TMDb u otro) para tener pósters, o se acepta la
  imagen de sustitución.
- **Acuerdos comerciales** opcionales: Spotify (con escala), Last.fm, Trakt, IGDB, Uber Eats, TheFork, DICE, RA,
  Podchaser.
- **Gmail:** decidir si se evalúa (legal y coste) más adelante.

### Siguiente paso

Si se acepta la especificación 1.1: fase 3, Google Data Portability (valoraciones y lugares), empezando por su ficha y
por un export real con la cuenta del usuario para fijar escalas y fechas.

---

## Entrega 2026-10-08 · fase 2 (Steam)

Rama `fase-2` (basada en `fase-1`), commit `867cd6c`, PR rferrermontesinos/appinity-claude#3.

### Qué se ha hecho

- **Validación en documentación oficial** de la autenticación y el acceso de Steam (ficha completa en
  [integration-capabilities.md](integration-capabilities.md#steam--fase-2)).
- **Adapter `profile/steam`** con la estructura común: OpenID 2.0 (construcción de URL y verificación completa con
  `check_authentication`), cliente de la Web API con reintentos y límites, sync de instantánea, mapper `steam-v1`,
  esquemas Zod de las respuestas, constantes y fixtures simulados.
- **Conexión con redirección**: `POST /v1/me/connections` devuelve la URL de Steam con un `state` de un solo uso;
  `GET /v1/connect/steam/callback` verifica y crea la conexión, encola el sync y vuelve a la app (lista blanca de URL).
- **Guardado y consolidación** con el pipeline común (resolución canónica por `steam:app`, observaciones idempotentes,
  perfiles), **desconexión** que olvida el SteamID y, opcionalmente, borra lo importado.
- **Errores**: perfiles o bibliotecas no visibles (mensaje accionable, conexión en «error», sin borrar evidencia), clave
  no válida (sin reintentos), 429/5xx/red (reintentos con backoff y `Retry-After`), entradas corruptas (errores
  parciales).
- **Syncs programados** cada hora para fuentes reales (24 h por conexión, configurable).
- **Cuenta local real** (`pnpm user:local`, migración `0003`) para usar datos propios con identidad de desarrollo, y
  aviso «DATOS REALES» en la app.
- **Credenciales sin chat**: `pnpm secret:set STEAM_WEB_API_KEY` (entrada oculta, solo a `.env`).
- **App**: login de cuenta local, botón oficial «Sign in through Steam», navegador de autenticación con vuelta a la
  app, estados «sin configurar», «solo cuentas reales» y «requiere tu acción», pista del SteamID.

### Comandos ejecutados y resultados (Windows 11, 2026-10-08)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm db:migrate` | Migración `0003_local_accounts_external_unique` aplicada |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK |
| `pnpm test` | **12 ficheros, 136 tests OK** (70 unitarios, 66 de integración). Nuevos: 17 unitarios de Steam (OpenID válido y manipulado, cliente con 429/5xx/403, biblioteca oculta frente a vacía, mapper, registro), 15 de integración del pipeline de Steam y 8 HTTP (cuenta local, inicio de conexión, callback, `state` de un solo uso, lista blanca de URL) |
| `pnpm db:seed` | La demo sigue igual e idempotente |
| `npx expo export --platform android --platform ios` | Bundles generados |
| `pnpm user:local --handle test_local_smoke …` | Crea la cuenta y guarda solo el hash (cuenta de prueba borrada después) |
| URL de OpenID contra Steam real | Steam acepta la petición y muestra su formulario «Iniciar sesión» con `return_to` en `192.168.1.16:3100` |

### Fallos detectados tras la entrega

- `pnpm secret:set` rechazaba una clave válida al pegarla en PowerShell: en modo «raw» el pegado puede llegar con
  caracteres de control o marcadores de pegado. Corregido: se limpian, se muestra un `*` por carácter, el error indica
  la longitud recibida (sin revelar el valor) y existe `--clipboard`. La clave nunca se guardó.

### Validación con la cuenta real (2026-10-08)

El usuario creó su clave, la guardó con `pnpm secret:set`, creó su cuenta local y conectó Steam desde el teléfono
(«Sign in through Steam»). Comprobado en la base de datos (solo totales):

| Comprobación | Resultado |
|---|---|
| Conexión | `active`, SteamID guardado, sin errores |
| Primer sync (al conectar, automático) | `succeeded`: 11 juegos recibidos, 11 evidencias nuevas, 11 objetos creados (dataset `live`), 0 errores parciales |
| Segundo sync (encolado como el botón «Sincronizar») | `succeeded`: **0 nuevas, 0 actualizadas, 11 sin cambios**, 0 borradas: sin duplicados |
| Claves idempotentes | 11 evidencias = 11 claves distintas |
| Modelo | 9 juegos con preferencia inferida (0,23–1,00, media 0,58); 2 jugados menos de 2 h, consumidos y sin preferencia; todas con fecha de última partida |
| Juegos con 0 h | La biblioteca real no tiene ninguno: la regla queda probada con fixtures, no con datos reales |
| Imágenes | 11 referencias al CDN de Steam (ninguno coincide con la instantánea de Wikidata); no se cachean |

### Observación de producto del usuario

«La sincronización debería hacerse automáticamente y sin tantos pasos, solo dando permisos al inicio, en el registro.
Se puede cambiar más adelante.» Registrado en [decisions.md](decisions.md#onboarding-y-sincronización-automática-observación-del-usuario).

### Pasos que hizo el usuario (solo desarrollo)

1. Crear la clave en <https://steamcommunity.com/dev/apikey> y guardarla con `pnpm secret:set STEAM_WEB_API_KEY`.
2. `pnpm user:local --handle … --name …` y entrar en la app con el código.
3. **Reiniciar `pnpm api` y `pnpm worker`**. Los que estaban en marcha desde la prueba de la demo tienen el código
   anterior cargado.
4. Perfil → Steam → «Sign in through Steam», comprobar la importación, repetir el sync (sin duplicados), juegos con
   0 h y desconectar.

Hechos el 2026-10-08. La desconexión con borrado está probada en integración con usuarios simulados; no se ejecutó
sobre la cuenta real para conservar sus datos.

### Limitaciones

- Sin fechas de lanzamiento de Steam (la Web API no las da); necesarias para Trending (fase 7).
- El arte de Steam es solo referencia; si el CDN no tiene cápsula 600×900, la app muestra el fallback.
- La cuenta local real sigue siendo identidad de desarrollo. La autenticación de producción llega en la fase 13.
- Calibración de horas → preferencia sin validar con datos reales.

### Siguiente paso

Fase 3 (TMDb) con `prompts/fase_03_tmdb.md`. *(Superado: TMDb se descartó en la revisión de fuentes del 2026-10-08.)*

---

## Entrega 2026-10-08 · fase 1

Rama `fase-1` (basada en `fase-0`), commit `97bf4e5`, PR rferrermontesinos/appinity-claude#2.

### Qué se ha hecho

- **Catálogo canónico** (`catalog_items`, `catalog_external_ids` con espacio de nombres y unicidad por dataset,
  `catalog_images` con licencia y autor) e instantánea real de Wikidata/Commons: 108 objetos (96 principales de las
  ocho categorías, 4 ediciones, 8 temporadas) y 82 imágenes libres. Caché de imágenes en almacenamiento propio,
  fallback SVG por categoría y fechas con su precisión real.
- **Contrato de observaciones** con validación runtime (Zod) y constraints SQL equivalentes. Known, Consumed y
  Preference independientes; NULL coherente.
- **Resolución de entidades**: ID canónico → ID de proveedor → proveedor de catálogo → atributos exactos → creación.
  Edición (ISBN) → obra. Nunca por título parecido. Bloqueos para evitar duplicados concurrentes.
- **Consolidación v1** versionada (`consolidation-v1`) en `packages/algorithms`, sin dependencias de proveedores.
- **Conexiones**: consentimiento por proveedor, ejecuciones de sync con contadores, cursores y errores parciales,
  credenciales cifradas (AES-256-GCM, probado; sin uso todavía), desconexión con borrado opcional y recálculo.
- **Pipeline de ingesta** (`runConnectionSync`) con paginación, idempotencia, instantáneas, bloqueo por conexión y
  protección frente a escrituras tras la revocación. Worker BullMQ con colas `profile-sync` y `catalog-images`.
- **Adapter fixture** con la estructura común de §8 y cinco fuentes simuladas (cine/series, diario, actividad y lugares,
  juegos, música y podcasts) con fixtures deterministas para 5 usuarios (Sam sin datos).
- **API**: `/v1/sources`, `/v1/me/connections` (+sync, runs, delete), `/v1/catalog/items`, `/v1/me/item-profiles`,
  `/media/catalog/*`, `/static/fallback/*`.
- **App**: gestión de fuentes en Perfil, catálogo por categoría con imágenes y fallback, «Modelo de datos (demo)» con
  las tres dimensiones y etiquetas de casos, detalle con atribución de imagen, IDs externos y evidencias propias.
- **Seed de demo completo** e idempotente (`pnpm db:seed`).

### Casos del modelo cubiertos por los fixtures (y dónde verlos)

| Caso | Usuario y objeto |
|---|---|
| Conocido sin consumo (watchlist, «quiero», guardado) | Laura: Dr. Strangelove, Don Quijote, Cal Boter, El juego del calamar |
| Consumo sin valoración | Laura: Some Like It Hot, The Office, La Regenta, Big Buck Bunny |
| Valoración positiva y negativa | Laura: Casablanca +0,78, Frankenstein −0,33, La noche de los muertos vivientes −0,56 |
| Juego con cero horas | Laura y Àlex: Mindustry; Àlex: Stardew Valley |
| Mismo objeto en tres fuentes | Laura: Casablanca (cine, diario y actividad), una entidad y un perfil |
| Valoración negativa frente a asistencia | Laura: MACBA; Marta: MNAC |
| Fechas ausentes y solo con año | Laura: Dr. Strangelove (sin fecha), La Regenta y Big Buck Bunny (año) |
| Edición → obra | Laura: Orgullo y prejuicio (ISBN de una edición en español) |
| Objeto sin imagen libre (fallback) | Robot Dreams, Stardew Valley, Baldur's Gate 3, Crims, Radiolab… |
| Objeto desconocido para el catálogo | Àlex: Portal (appid 400) |
| Escucha aislada sin preferencia | Laura: Joan Manuel Serrat (1 escucha) |
| Episodios agregados por programa | Núria: Serial (5 episodios), Crims (6) |
| Evento previsto sin asistencia | Laura: Palau de la Música; Marta: 31 Manga Barcelona |
| Registro inválido (validación runtime) | Laura: `scr-l-10` (valoración 11) |
| Usuario sin evidencia | Sam |

### Comandos ejecutados y resultados (Windows 11, 2026-10-08)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm db:reset` y `pnpm db:seed` (repetido) | 6 usuarios, 108 objetos, 14 syncs. Segunda ejecución: 0 nuevos y 0 actualizados en todo; 109 objetos (108 + Portal), 82 observaciones, 74 perfiles, 14 conexiones |
| `pnpm worker` (caché de imágenes) | 82/82 imágenes cacheadas (24 MB en `.data/media`) |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK |
| `pnpm test` | **9 ficheros, 96 tests OK**: 53 unitarios (normalización, consolidación, mappers fixture, sync, registro, cifrado, i18n, categorías) y 43 de integración (pipeline completo, API de catálogo, conexiones y perfiles, auth) |
| `npx expo install --check` | «Dependencies are up to date» |
| `npx expo export --platform android --platform ios` | Bundles Hermes generados (Android 5,3 MB, iOS 5,1 MB) |
| API por la IP de red (`curl` desde el PC) | Fuentes, conexiones, catálogo, perfiles, imágenes 200, fallback 200, path traversal 404, recursos ajenos 404 |
| Flujo completo por la IP de red | Marta: desconectar y borrar (13 → 1 perfil), reconectar (sync del worker +13), resync completo (=13, sin duplicados) |
| Vista web de desarrollo (navegador integrado, 375×812) | dev-login, Modelo (28 objetos de Laura), detalle de Casablanca, catálogo de juegos (11 imágenes 200 + 4 fallbacks), Perfil/fuentes, estado vacío de Sam en inglés |

### Fallos detectados y corregidos durante la verificación

- La segunda ejecución del seed marcaba 2 observaciones como actualizadas: la huella incluía el método de resolución.
- Conectar dos veces una fuente devolvía 500 en lugar de 409 (Drizzle envuelve el error de PostgreSQL).
- La app cerraba sesión al arrancar: una consulta sin token recibía 401 y borraba la sesión guardada (afectaba también
  al móvil).
- Precisión de fecha inventada en ediciones y temporadas de la instantánea («día» cuando solo había año).
- Errores parciales mostrados como JSON en bruto; ahora son legibles.

### Validación manual pendiente (usuario, en el teléfono)

Recorrido de 16 pasos de la sección «Probar en el teléfono» del README. En particular: carga en Expo Go del SDK 57,
API alcanzable desde el móvil, imágenes reales y fallback, las tres dimensiones en «Modelo de datos (demo)», sync
repetido sin duplicados, desconectar y borrar, cambio de idioma y de ajustes.

**No se ha probado en ningún dispositivo ni emulador**: el emulador del PC tiene Expo Go 55 y no se actualizó para no
alterar la otra implementación.

### Limitaciones de esta entrega

- Todas las fuentes son simuladas; ninguna integración real está validada.
- Sin recomendador, afinidad, almas gemelas, Trending ni carrusel (fases 5–8); Categories muestra catálogo, no
  recomendaciones.
- Los parámetros de normalización, consolidación y resolución son propuestas sin calibrar.
- Las imágenes cacheadas no se redimensionan (algunas superan 1 MB).
- No hay pruebas automatizadas de interfaz en dispositivo.
- Identidad de desarrollo; sin autenticación de producción.

### Siguiente paso

Aceptación manual de la demo por el usuario. Después, fase 2 (Steam) con `prompts/fase_02_steam.md`.

---

## Entrega 2026-10-08 · fase 0

Rama `fase-0`, PR rferrermontesinos/appinity-claude#1.

### Qué se ha hecho

- Monorepo pnpm (Node 24, pnpm 11, TypeScript 6) con `apps/api`, `apps/mobile`, `packages/{shared,i18n,
  algorithms,database,catalog,integrations,ingestion}` y `workers/sync-worker`.
- Docker Compose aislado (`appinity-claude`): PostgreSQL 17 + PostGIS 3.5 en 5442 y Redis 7.4 en 6390.
- Migraciones Drizzle `0000_enable_postgis` y `0001_identity` (`users`, `user_profiles`, `user_settings`).
- Seed determinista de 6 usuarios **simulados** (`dataset = demo`).
- API NestJS: `/health`, identidad de desarrollo (`/v1/dev/users`, `/v1/dev/session`), `/v1/me`,
  `PATCH /v1/me/settings`, guard global de sesión, rate limiting, validación Zod y configuración validada al
  arrancar.
- Worker BullMQ con latido en Redis, visible en `/health`.
- App Expo SDK 57: elección de usuario de demo, cuatro pestañas (Inicio, Categorías, Personas, Perfil), ajustes
  conectados a la API, diagnóstico de red e i18n es/en.
- Scripts `pnpm setup` (secretos e IP de red) y `pnpm doctor` (diagnóstico).

### Comandos ejecutados y resultados (Windows 11, 2026-10-08)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK («Already up to date», 11 proyectos del workspace) |
| `pnpm setup` | `.env` creado; `EXPO_PUBLIC_API_URL=http://192.168.1.16:3100` |
| `pnpm services:up` | Postgres y Redis `healthy` |
| `pnpm db:migrate` (dos veces) | OK las dos veces (idempotente) |
| `pnpm db:seed` (dos veces) | 6 usuarios; sin duplicados (`select count(*) from users` = 6) |
| `pnpm db:reset` | Vacía, migra y siembra correctamente |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | OK (paquetes, tests y app móvil) |
| `pnpm test` | 3 ficheros, **19 tests OK** (unit: i18n y categorías; integración: health, 401 sin sesión, token falso, otro secreto, caducado, `kind` incorrecto, token con `sub` de usuario real, usuario suspendido, aislamiento por usuario, validación de ajustes, redondeo de ubicación, prohibición de `DEMO_MODE` en producción, identidad desactivada) |
| `pnpm api` + `pnpm worker` | `/health` 200 con database, postgis (3.5.2), redis y worker OK |
| `curl http://192.168.1.16:3100/health` (desde el PC) | 200 `status: ok` |
| `npx expo export --platform android --platform ios` | Bundles Hermes generados (Android 5,2 MB; iOS 5 MB) |
| `npx expo install --check` | «Dependencies are up to date» (SDK 57) |
| `npx expo start --port 8091` | Manifiesto servido en `http://192.168.1.16:8091` con `runtimeVersion exposdk:57.0.0` |
| `pnpm doctor` | Servicios healthy; API accesible en 127.0.0.1 y en 192.168.1.16 |

### Validación manual pendiente (usuario, en el teléfono)

- Abrir `http://<IP-del-PC>:3100/health` en el navegador del móvil.
- Cargar la app con Expo Go, elegir usuario, recorrer las cuatro pestañas, cambiar idioma, radio y zona.
- El acceso a la API desde el móvil **no se ha comprobado aquí**: solo desde el propio PC por la IP de red.

### Limitaciones de esta entrega

- La identidad es de desarrollo; no hay autenticación de producción.
- Sin catálogo, observaciones, conexiones ni consolidación (fase 1).
- Los tests de interfaz móvil no se han automatizado; la prueba en el dispositivo es manual.
- Durante la verificación se detuvo por error el servidor Metro (puerto 8081) de otra implementación local; no
  se tocaron sus archivos ni datos. Desde entonces solo se detienen procesos cuya ruta contiene `APPINITY CLAUDE`.

### Siguiente paso

Fase 1: catálogo con imágenes y fallback, IDs canónicos, observaciones normalizadas, conexiones, consolidación,
adapter fixture y vista de demo del modelo.
