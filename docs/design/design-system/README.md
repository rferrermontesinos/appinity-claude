# Sistema de diseño de APPINITY · «Noche de cine»

D1 de las fases de diseño (D0 en `../D0-direccion.md`). Guía de referencia: **Material (tokens) + MUI (catálogo y
props `variant/size/color`)**, multiplataforma (Expo / React Native).

| Fichero | Qué es |
|---|---|
| `styles.css` | **Fuente de verdad**: tokens (oscuro por defecto y `:root[data-theme="light"]`) y clases de componentes |
| `index.html` | Guía viva: fundamentos y 44 componentes, con Dev Mode (inspector) y «Copiar como prompt» (React Native primero) |
| `concept.html` | Dos pantallas de concepto, solo con componentes: «Para ti» (carrusel) y el perfil de un alma gemela |
| `icons.html` | Sprite de 43 iconos propios (estilo Material/Lucide, licencias abiertas; nunca emoji) |
| `theme.js` | Selector claro/oscuro compartido |
| `src/` | Fuentes (`*.src.html`), `build.mjs` (incrusta el sprite) y `serve.mjs` (servidor local en 8093) |

Abrir: doble clic en `index.html` (funciona con `file://`). Tras editar `src/`: `node docs/design/design-system/src/build.mjs`.

## Decisiones

- **Una familia de interacción**: el violeta, solo para la afinidad y la acción principal. El ámbar se reserva para NEW
  y los momentos especiales. El color de cada categoría es una **señal** (punto, icono o tinte del 20 %), nunca el fondo
  de un texto.
- **Neutros cálidos** derivados de `#121110` (tono ~60° en OKLCH, croma bajo). **Elevación tonal** en oscuro: la
  superficie se aclara (bg → surface → surface-raised).
- **Tipografía**: lectura con la fuente del sistema; Space Grotesk (Google Fonts, OFL) solo en titulares, títulos de
  obras y cifras de afinidad.
- **Afinidad sin datos = «—»**, nunca 0 %.
- **Contraste**: todos los pares `relleno / --on-*` superan **AA (4,5:1)** con la fórmula WCAG, en ambos temas. El más
  justo es el primario en oscuro, con 5,47. La acción del snackbar usa `--inverse-primary` (7,30).

## Catálogo (44)

- **Inputs (12)**: Button y Button group, Icon button, FAB, Checkbox, Radio group, Switch, Select, Autocomplete,
  Slider, Text field, Toggle button y Rating.
- **Data display (9)**: Avatar, Badge, Chip, Divider, List, Table, Tooltip, Typography e Icon.
- **Feedback (6)**: Alert, Dialog, Snackbar, Progress, Skeleton y Backdrop.
- **Surfaces (4)**: App bar, Card, Paper y Accordion.
- **Navigation (7)**: Bottom navigation, Drawer, Tabs, Menu, Link, Stepper y Speed dial.
- **Extensiones de APPINITY (6)**: Tarjeta de recomendación, Medidor de afinidad, Fila de persona, Chip de categoría,
  Tarjeta de fuente y Estado vacío.

## Cómo ampliar

- **Token nuevo**: añádelo en `:root` **y** en `:root[data-theme="light"]` si cambia con el tema. Un relleno siempre
  lleva su `--on-*`; comprueba el contraste con la fórmula WCAG.
- **Componente nuevo**: añade la clase en `styles.css` (solo tokens), una `<section id="clave">` con `data-insp="clave"`
  en `src/index.src.html`, una entrada en `SPECS` y el enlace en la barra lateral. Después, ejecuta `build.mjs`.
- **Otro tema**: cambia solo la capa de tokens; la guía y el concepto lo reflejan sin tocar los componentes.

## Siguiente fase (D4)

Llevar los tokens al tema de la app (`apps/mobile/src/theme.ts`) y las extensiones a componentes de React Native:
primero la tarjeta de recomendación, el medidor de afinidad y la fila de persona.
