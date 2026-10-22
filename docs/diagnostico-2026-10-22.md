# Diagnóstico de APPINITY · 2026-10-22

Medido con la cuenta real del titular, ya fusionada: 141 observaciones de 6 fuentes y 138 gustos consolidados. Se
usaron la base de datos local, los tests (347 OK) y las comprobaciones reales de las fases 11 a 13.

## 1. Estado frente a las fases de la especificación

| Fase | Entrega | Estado | Qué falta |
|---|---|---|---|
| 0 | Monorepo, API, app, BD, Redis, auth base, i18n | ✅ Hecha | — |
| 1 | Catálogo, observaciones, consolidación, fixtures | ✅ Hecha | Imágenes del catálogo real (ver §2.3) |
| 2 | Steam | ✅ Validada con cuenta real | — |
| 3 | Google Data Portability: valoraciones y lugares | ✅ Validada (115 evidencias) | Permiso de 7 días en modo Testing |
| 4 | YouTube y agregación musical | ✅ Validada | En producción depende de un scope restringido (ver §2.2) |
| 5 | Afinidad versionada | ✅ Hecha | Simétrica por decisión del titular (affinity-v3) |
| 6 | Ranking Top 50 | ✅ Hecha | Sin otros usuarios reales no se ha probado en real |
| 7 | Recomendador 70/20/10 y Trending | ✅ Hecha con tests | Sin efecto real: 1 usuario y sin ubicación (ver §2.1) |
| 8 | Home con carrusel | ✅ Hecha | Diseño visual pendiente |
| 9 | Categories | ✅ Hecha | Diseño visual pendiente |
| 10 | People y Friends | ✅ Hecha | Contactos del dispositivo sin probar en el móvil |
| 11 | Resto de adapters | 🟡 Parcial | Hechos y validados: Google Play, reservas, guardados, Books, Calendar, Trakt y AniList. Apple Music descartada (de pago). Calendario nativo cubierto por Google Calendar |
| 12 | Chat, Premium y notificaciones | 🟡 Servidor hecho | Chat completo. Premium y push sin la parte de la app: necesitan una build de desarrollo |
| 13 | Preparación de la beta | 🟡 Parcial | Hecho: auth de producción, Docker y backups. Falta: verificación de Google (dominio), builds y auditoría de seguridad |

## 2. Diagnóstico crítico del core

### 2.1 El problema principal: sin red no hay producto

- **Hay 1 usuario real.** Las afinidades reales dan 0 parejas y no hay almas gemelas.
- **El recomendador devuelve 3 objetos para la cuenta real, todos de «explorar».** Consenso y descubrimiento no tienen
  de dónde sacar recomendaciones.
- **La propuesta de valor depende de que haya otros usuarios afines.** Con 0, 1 o 10 usuarios la app no aporta valor.
  El motor está bien, pero el producto no arranca.
- **Hace falta un recomendador que funcione sin red**, basado solo en el contenido (gratis):
  - relaciones de Wikidata: mismo género, influencias, mismo director o autor, artistas similares (P737, P136, P57…);
  - lugares cercanos del mismo tipo que los que gustan (OSM);
  - se mezclaría como bloque «Porque te gusta X» hasta que existan almas gemelas.
- **El crecimiento depende de que entren grupos de amigos.** Faltan invitaciones (enlace o QR) y que una invitación
  aceptada cree la amistad.

### 2.2 Las fuentes, el core declarado

- **Sesgo por categoría** (gustos de la cuenta real):

  | Categoría | Gustos | Observación |
  |---|---|---|
  | food | 55 | |
  | music | 46 | Todos positivos: escuchas = gusto |
  | culture | 17 | Casi todo solo «conocido» |
  | games | 11 | |
  | movies | 3 | |
  | podcasts | 3 | |
  | books | 2 | |
  | series | 1 | |

  Cine, series y libros, que son categorías clave, apenas tienen datos.
- **Música 100 % positiva**: las escuchas solo generan gustos y nunca disgustos. Dos usuarios que escuchan mucho
  tendrán afinidades musicales altas por volumen. Hay que vigilar la calibración por usuario (p95) con datos reales.
- **En producción sin pagar CASA se pierde `myactivity.youtube`**, la fuente de casi toda la música. Quedan la
  biblioteca de YouTube Music y las suscripciones, que dan conocimiento pero apenas preferencia. **Riesgo alto para
  la música.**
- **Cine y series**: las fuentes gratuitas y globales son Google Búsqueda (pulgares y «visto») y Trakt, que es de
  nicho. TMDB, Letterboxd y Simkl exigen licencia. **Es la categoría más débil del producto.**
- **Fragilidad de Google**: permisos de 7 días en Testing, un export cada 24 h y un refresh token que solo llega la
  primera vez. Ya está gestionado, pero cualquier usuario de la beta lo sufrirá hasta la verificación.

### 2.3 Calidad del catálogo

- **Solo 13 de 142 objetos reales (9 %) tienen imagen**; el catálogo de la demo tiene el 75 %. En una app visual de
  carrusel esto es grave.
- **Arreglo gratuito**:
  - imagen de Wikidata y Commons (P18, P154 logo) para todo lo identificado por QID;
  - cabecera de Steam para los juegos;
  - Commons por coordenadas o etiqueta `wikimedia_commons` de OSM para los lugares.
- **Identificación conservadora**: el calendario identificó 5 de 23 lugares y AniList 55 % en listas reales. Es
  correcto no inventar, pero hay margen, por ejemplo comparando nombres de OSM con variantes como «Restaurante X» y
  «X».

### 2.4 Experiencia y funcionalidades

- **Sin ubicación en la cuenta real** no hay Trending ni recomendaciones de restaurantes, y el alta no la pide. Hay
  que pedir la ciudad en el alta (una sola vez, sin GPS obligatorio).
- **Sin build de desarrollo**:
  - no hay push en Android (Expo Go);
  - Premium no se puede probar;
  - Google Books y Calendar solo funcionan desde la vista web del PC, porque en desarrollo Google solo vuelve a
    localhost.
- **El diseño visual es funcional pero no tiene identidad**: no hay sistema de diseño (tokens, tipografía,
  componentes). Para una app de descubrimiento social, la estética es parte del producto.
- **Explicabilidad**: las razones existen («por tu alma gemela X»), pero sin red no se ven. El perfil propio no
  explica qué fuente aporta cada gusto ni permite corregir una identificación errónea.

### 2.5 Operación

- El entorno local es frágil: Docker Desktop no arranca solo y la IP de la red local cambia (ya arreglado en la app).
- No hay CI en GitHub: los tests solo se ejecutan en local. GitHub Actions es gratis en repos públicos y tiene cuota
  gratuita en privados.
- Hay 22 PR apilados sin fusionar. El riesgo de conflictos crece y conviene fusionarlos en orden.

## 3. Prioridades propuestas (todas sin coste)

1. **Recomendador por contenido** (Wikidata y OSM) para el arranque en frío. Sin esto, la beta no tiene valor.
2. **Imágenes del catálogo real** desde Wikidata, Commons y Steam.
3. **Ciudad en el alta**, para activar Trending y los lugares.
4. **Invitaciones** con enlace o QR que creen la amistad: crecimiento por grupos.
5. **Diseño** (abajo).
6. **CI** con GitHub Actions y fusión ordenada de los PR.
7. **Build de desarrollo local** con Android Studio, gratis y sin EAS de pago: push, Premium sandbox y retorno de
   Google en el móvil.

## 4. Fases de diseño

| Fase | Entrega | Herramientas gratuitas |
|---|---|---|
| D0 · Dirección | Principios, tono, referencias (Tinder, Letterboxd, Spotify Wrapped) y moodboard; decidir la identidad | Plugin «Design» de Anthropic (crítica e investigación) |
| D1 · Sistema de diseño | Tokens de color (8 categorías ya tienen color), tipografía, espaciado, modo oscuro, iconos y componentes base (tarjeta, chip de categoría, medidor de afinidad, avatar) | Plugin «Mobile Design System» (guía HTML local, sin Figma) |
| D2 · Flujos clave | Alta y consentimiento único, Home y carrusel, Categories, People (almas gemelas, amigos, chat) y Perfil y fuentes | Prototipos HTML navegables |
| D3 · Alta fidelidad | Pantallas finales en claro y oscuro, estados vacíos y de error, arranque en frío | Prototipos HTML y capturas de la vista web |
| D4 · Implementación | Tema de Expo con los tokens; componentes reutilizables; migración pantalla a pantalla | Código |
| D5 · Validación | Accesibilidad (contraste, tamaños, lector de pantalla) y prueba en el teléfono | Skill de accesibilidad del plugin «Design» |

Figma es opcional: su plan gratuito basta para mirar, pero el flujo propuesto funciona sin cuentas ni pagos.
