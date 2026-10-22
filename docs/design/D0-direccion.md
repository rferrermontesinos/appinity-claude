# D0 · Dirección de diseño de APPINITY

Estado: **propuesta**, pendiente de la elección del titular. Siguiente paso: D1, el sistema de diseño, con los plugins
«Mobile Design System» y «Design» instalados el 2026-10-22.

## Qué tiene que transmitir

APPINITY no es un catálogo: es **gente con gustos**. La pregunta que contesta es «¿quién piensa como yo y qué me
recomienda?».

| Principio | Qué significa en pantalla |
|---|---|
| **Personas antes que objetos** | La afinidad (%) y las caras de las almas gemelas mandan; las obras son el tema de conversación |
| **Cada recomendación se explica** | Cada tarjeta lleva su motivo real: «Del director de *2001*», «3 almas gemelas lo adoran», «Trending en Barcelona». Nunca un «98 % para ti» inventado |
| **Ocho mundos, una app** | Cada categoría tiene color e icono propios (ya definidos), y la app es neutra para que sean ellas las que dan color |
| **Honestidad visual** | Datos reales, simulados y pendientes se distinguen. Un fallback de imagen se ve como tal, no como una foto falsa |
| **Gesto, no formulario** | Deslizar, conservar y deshacer, como en Tinder; un único consentimiento en el alta |

## Referencias (qué tomar de cada una)

| Referencia | Qué tomar |
|---|---|
| Tinder | Carrusel de tarjetas a pantalla casi completa, gestos y el «match» como momento emocional del chat |
| Spotify Wrapped | Tipografía grande y datos personales convertidos en orgullo («Tu afinidad musical con Laura: 91 %») |
| Letterboxd | Pósters como protagonistas y fondo oscuro que no compite con ellos |
| Hinge | Perfiles con tarjetas de «qué nos une», más conversación y menos superficialidad |

## Dos direcciones posibles

### A · «Noche de cine» (recomendada)

- **Fondo**: oscuro cálido por defecto (`#121110`), con modo claro disponible.
- **Imágenes**: las de obras y lugares a sangre en las tarjetas.
- **Acento**: el violeta actual (`#8E78F0`), solo para afinidad y acciones principales.
- **Categorías**: su color aparece en el chip y en un degradado sutil sobre la imagen.
- **Tipografía**: una grotesca con carácter para los titulares y las cifras de afinidad (p. ej., *Space Grotesk*,
  gratuita en Google Fonts), y la del sistema para el texto.
- **Por qué**: las imágenes (Commons, Steam y pósters) lucen más sobre oscuro, y la afinidad en violeta se lee como
  «lo especial».

### B · «Papel y tinta»

- **Fondo**: claro cálido (`#F6F4F1`, el actual) y aire editorial.
- **Tipografía**: serif para los títulos de las obras (*Fraunces*, gratuita) y sans para la interfaz.
- **Categorías**: sus colores como tintas planas.
- **Por qué**: más tranquila y «de revista». Con muchos fallbacks de imagen queda mejor que la A, aunque la emoción del
  carrusel pierde fuerza.

## Componentes clave (para D1)

1. **Tarjeta de recomendación**:
   - imagen o fallback, chip de categoría, título y año;
   - motivo con icono por bloque;
   - acciones de descartar, conservar y deshacer.
2. **Medidor de afinidad**: anillo o barra con la cifra grande. Si no hay datos, «—», nunca 0.
3. **Fila de persona**: avatar, nombre, país y afinidad, más la etiqueta de amigo o alma gemela.
4. **Chip de categoría**: color, icono y nombre (8 variantes).
5. **Tarjeta de fuente** (Perfil): estado (conectada, sincronizando, error o pendiente), qué aporta y cuándo se
   sincronizó por última vez.
6. **Estados vacíos y de arranque en frío**: invitar amigos, conectar fuentes y explicar por qué aún no hay almas
   gemelas.

## Accesibilidad (requisito, no extra)

- Contraste AA en ambos temas, también del texto sobre imagen (velo degradado).
- Objetivos táctiles de 44 pt o más; cada gesto tiene un botón alternativo (ya existe).
- Ninguna información solo por color: las categorías llevan siempre icono y nombre.

## Decisión pendiente del titular

Elegir **A** o **B**. A falta de respuesta, D1 sigue con **A**.
