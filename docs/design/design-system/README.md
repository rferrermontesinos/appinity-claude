# Sistema de diseño de APPINITY · «Aura»

Dirección «Aura» (2026-10-26): vibrante, cómplice, sobremesa. Sustituye a «Noche de cine» (D0). Maqueta de dirección
en `../aura/mockup.html`; decisión y motivos en `docs/decisions.md`. Guía de referencia: **Material (tokens) + MUI
(catálogo y props `variant/size/color`)**, multiplataforma (Expo / React Native).

| Fichero | Qué es |
|---|---|
| `styles.css` | Tokens de la guía (oscuro por defecto y `:root[data-theme="light"]`) y clases de componentes. Mismos valores que `apps/mobile/src/theme.ts`, que es la fuente de verdad en la app |
| `index.html` | Guía viva: fundamentos, la sección **Aura** y 44 componentes, con Dev Mode (inspector) y «Copiar como prompt» (React Native primero) |
| `concept.html` | Dos pantallas de concepto, solo con componentes (de la etapa anterior; con los tokens nuevos) |
| `icons.html` | Sprite de 43 iconos propios (estilo Material/Lucide, licencias abiertas; nunca emoji) |
| `theme.js` | Selector claro/oscuro compartido |
| `src/` | Fuentes (`*.src.html`), `build.mjs` (incrusta el sprite) y `serve.mjs` (servidor local en 8093) |

Abrir con el servidor (`node docs/design/design-system/src/serve.mjs`, puerto 8093): con `file://` algunos visores no
cargan `styles.css`. Tras editar `src/`: `node docs/design/design-system/src/build.mjs`.

## Decisiones

- **Dos acentos con papel fijo**: **chispa** (coral `#FF5E4D`, texto `#1A0806`) solo para la acción principal;
  **lima** (`#D4F45A`, texto `#141A02`; `#4D6A00` en claro) solo para afinidad y almas gemelas. El ámbar se queda para
  NEW y los datos de ejemplo. Se retira el violeta (aspecto genérico de «app de IA»).
- **Neutros casi negros**: `#0C0C0E` → `#17161B` → `#211F27` (elevación tonal: la superficie se aclara).
- **Categorías**: los 8 colores tiñen el **halo**, los **carteles** y el «mundo» de las pantallas de detalle (fondo 7 %,
  filas 8 %, destacadas 12 %, borde 35 %). Nunca son el fondo de un texto pequeño; siempre van con icono y nombre.
- **Halo**: luz ambiental del color de lo que se muestra, con grano, siempre detrás de una superficie. En la app se
  hace con círculos concéntricos y una textura PNG (sin degradados nativos ni módulos nuevos).
- **Carteles** (`--poster-base`, `--on-poster`): fondo oscuro fijo en ambos temas para alma gemela, perfil y categoría.
- **Tipografía**: lectura con la fuente del sistema; **Bricolage Grotesque** (Google Fonts, OFL) en titulares, títulos de
  obras y cifras (600/700/800).
- **Movimiento**: muelle al soltar (`--ease-spring`), cifras que cuentan y fundido del halo (`--dur-aura`, 500 ms). Todo se
  apaga con «reducir movimiento».
- **Afinidad sin datos = «—»**, nunca 0 %. **Recomendaciones**: solo cifras reales y agregadas (almas gemelas que lo
  recomiendan, afinidad media).
- **Contraste**: todos los pares de texto superan AA (4,5:1), en ambos temas y en el peor tinte (Cultura). El gris tenue
  sobre fila destacada (4,12:1) solo se usa en iconos (3:1). Cálculos en `docs/progress.md`.

## Catálogo (44)

- **Inputs (12)**: Button y Button group, Icon button, FAB, Checkbox, Radio group, Switch, Select, Autocomplete,
  Slider, Text field, Toggle button y Rating.
- **Data display (9)**: Avatar, Badge, Chip, Divider, List, Table, Tooltip, Typography e Icon.
- **Feedback (6)**: Alert, Dialog, Snackbar, Progress, Skeleton y Backdrop.
- **Surfaces (4)**: App bar, Card, Paper y Accordion.
- **Navigation (7)**: Bottom navigation, Drawer, Tabs, Menu, Link, Stepper y Speed dial.
- **Extensiones de APPINITY (6)**: Tarjeta de recomendación, Medidor de afinidad, Fila de persona, Chip de categoría,
  Tarjeta de fuente y Estado vacío.

- **Aura (sección propia)**: halo, cartel de categoría y de alma gemela, fila de ranking y «Dónde encontrarlo».

## Cómo ampliar

- **Token nuevo**: añádelo en `:root` **y** en `:root[data-theme="light"]` si cambia con el tema. Un relleno siempre
  lleva su `--on-*`; comprueba el contraste con la fórmula WCAG.
- **Componente nuevo**: añade la clase en `styles.css` (solo tokens), una `<section id="clave">` con `data-insp="clave"`
  en `src/index.src.html`, una entrada en `SPECS` y el enlace en la barra lateral. Después, ejecuta `build.mjs`.
- **Otro tema**: cambia solo la capa de tokens; la guía y el concepto lo reflejan sin tocar los componentes.

## Estado de «Aura» en la app (2026-10-26)

- **Hecho**: tokens y fuente (`theme.ts`), Inicio, Personas (momento Wrapped), ficha de persona, Categorías (carteles,
  detalle con ranking y mundo de la categoría), ficha de objeto («Dónde encontrarlo»), Perfil (tu cartel) y barra
  inferior. Rama `diseno-aura`, PR rferrermontesinos/appinity-claude#24.
- **Pendiente**: aceptación en el teléfono; barra inferior flotante (necesita la altura real de la barra); chat,
  alta y pantallas secundarias con los componentes nuevos.
