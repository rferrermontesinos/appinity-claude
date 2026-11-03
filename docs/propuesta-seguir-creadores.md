# Propuesta: seguir a creadores y personas (2026-10-26)

Estado: **propuesta**, pendiente de las decisiones del titular (al final). No cambia nada implementado.

## Objetivo

Poder seguir a personas concretas (creadores, críticos, cocineros, amigos con buen gusto) y que sus gustos aparezcan en
las recomendaciones, **sin quitar valor a las almas gemelas desconocidas**, que son lo diferencial de APPINITY.
Ejemplo de tarjeta: «A Rosalía (a quien sigues) y a 34 de tus almas gemelas les encanta esto».

## Principio de diseño: dos capas separadas

| Capa | Quién | Qué decide |
|---|---|---|
| **Almas gemelas** | Calculadas por afinidad (Top 50, igual peso) | El **orden** del 70 % de consenso. Intacto: un seguido nunca vota aquí |
| **Seguidos** | Elegidos por el usuario | 1) **Enriquecen el motivo** de una tarjeta que ya sale por consenso. 2) Un **cupo pequeño propio** de tarjetas |

Así el titular de la tarjeta («A Rosalía y a 34 de tus almas gemelas…») aparece cuando **las dos capas coinciden**,
que es justo cuando el mensaje es más fuerte y más honesto: lo recomiendan tus almas gemelas **y** alguien a quien
admiras.

### 1. Motivo combinado (no cambia el orden)

Si un objeto del bloque de consenso también le gusta mucho (≥ umbral de preferencia positiva) a alguien que sigues, el
motivo se enriquece:

- «A Rosalía (a quien sigues) y a 34 de tus almas gemelas les encanta»
- «A 2 personas que sigues y a 12 de tus almas gemelas les encanta»

El número de almas gemelas es el mismo apoyo único del consenso (Top 50). No se altera la puntuación, así que las almas
gemelas siguen mandando.

### 2. Cupo de seguidos

Tarjetas que salen **solo** de alguien que sigues (aunque no sea alma gemela): como mucho **1 de cada 10**, tomado del
20 % de descubrimiento individual (que ya parte «de una persona concreta»). Mezcla resultante: 70 consenso · 10
descubrimiento por alma gemela · 10 seguidos · 10 Trending. Si no sigues a nadie, el cupo vuelve al descubrimiento.

Motivo: «Recomendado por Rosalía, a quien sigues · 72 % de afinidad en música». Mostrar la afinidad con la persona
seguida mantiene la seña de identidad: el usuario ve si de verdad se parecen.

## A quién se puede seguir

| Opción | Cómo | Valoración |
|---|---|---|
| **A · Creadores en APPINITY** | Una persona activa «perfil público de creador»: consiente que sus gustos (de sus fuentes) sean visibles y seguibles. Insignia de verificación para personas conocidas | **Recomendada**. Consentimiento claro, mismo motor y mismas fuentes |
| **B · Personas públicas sin cuenta** | Perfiles construidos con lo que han publicado ellas (listas de favoritos, listas públicas) | Riesgo legal: presentar a alguien como recomendador sin su permiso puede parecer un respaldo publicitario. Si se hace, solo con cita literal y fecha («lo incluyó en su lista pública de 2025»), nunca «le encanta» |
| **C · Amigos** | Ya existe la amistad: «seguir» a un amigo usaría la misma capa | Fácil, la tabla de amistades ya existe |

## Pros

- **Crecimiento**: un creador invita a su comunidad con un gancho fuerte: «¿cuánto te pareces a X?». Cada creador trae
  usuarios, y esos usuarios generan almas gemelas para todos.
- **Arranque en frío**: un usuario nuevo tiene recomendaciones desde el primer día aunque aún no haya almas gemelas.
- **Mensaje aspiracional y confianza**: el motivo combinado es muy convincente.
- **Negocio**: acuerdos con creadores y marcas sin anuncios.

## Contras y cómo mitigarlos

| Riesgo | Mitigación |
|---|---|
| **Diluir las almas gemelas** | Los seguidos nunca votan en el consenso; cupo máximo de 1 de cada 10 |
| **Homogeneidad** (todos ven lo mismo de los creadores famosos) | El cupo es pequeño y se reparte entre varios seguidos; descartes y conocidos se filtran igual |
| **Privacidad y seguridad del creador** (sus restaurantes revelan dónde está) | Lugares de un creador solo con retraso (p. ej., > 30 días desde la visita) o excluidos; nunca la fecha exacta |
| **Suplantación** | Verificación antes de mostrar la insignia; reportar perfiles |
| **Personas públicas sin cuenta** (opción B) | No empezar por ahí; si se hace, citas literales con fuente y fecha |
| **Cambios de especificación** | La mezcla 70/20/10 pasa a 70/10/10/10 y aparece el «perfil público de creador»: requiere aprobación del titular |

## Implementación (estimación)

1. **Modelo**: ajuste «perfil público de creador» (opt-in) y verificación; tabla `follows` (seguidor, seguido, fecha).
   Seguir nunca cambia gustos ni afinidades.
2. **Recomendador**: motivo combinado en el bloque de consenso; bloque de seguidos con su cupo; nuevos códigos de motivo.
3. **API**: seguir y dejar de seguir, lista de seguidos y perfil público de creador (con su afinidad hacia ti).
4. **App**: botón «Seguir» en el perfil de un creador, «Siguiendo» en Personas, motivo con el avatar del creador en la
   tarjeta.
5. **Tests**: un seguido no cambia el orden del consenso; cupo respetado; privacidad de lugares del creador.

## Decisiones del titular

1. ¿Opción A (creadores con cuenta) como punto de partida?
2. ¿Mezcla 70/10/10/10 (seguidos como máximo 1 de cada 10)?
3. ¿Lugares de creadores con retraso de 30 días, o excluidos?
