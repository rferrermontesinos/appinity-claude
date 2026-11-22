# Competencia: Hypelist (análisis 2026-10-26)

Fuentes: [App Store](https://apps.apple.com/app/id1636503066), [TechCrunch (dic. 2024)](https://techcrunch.com/?p=2922455),
[Product Hunt](https://www.producthunt.com/@cobo) y [screensdesign](https://screensdesign.com/apps/hypelist-create-share-lists/)
(estimaciones de terceros, no verificadas).

## Qué es

- App de **listas** de todo (películas, series, libros, música, juegos, lugares, productos) para crear, compartir y
  descubrir recomendaciones de amigos, creadores y la comunidad. iOS, Android y web.
- Fundador: Alfonso Cobo (antes Unfold, comprada por Squarespace). Lanzada en enero de 2024.
- Funciones: listas colaborativas, listas por rango o niveles, «Taste Diary», mapa («Hype Map»), estantería, comentarios,
  asistente de IA que sugiere elementos para tus listas y responde preguntas.
- Entrada de datos: **manual**, con ayudas (escanear notas y capturas, enlaces de TikTok, Reels y Maps, estanterías de
  Goodreads, extensión para compartir).
- Negocio: gratis con suscripción «Hypelist Ultra» (listas privadas, sin límites, créditos de IA); sin anuncios.
- Tracción visible: 4,7 con **443 valoraciones** en la App Store de EE. UU. y premio Editors' Choice. No hay cifras
  públicas de usuarios ni de financiación; un tercero estima menos de 5.000 $ de ingresos (dato no verificado).

## ¿Es competencia?

**Parcial.** Resuelve la misma necesidad («qué ver, leer o dónde comer, recomendado por gente de confianza») con el
mecanismo opuesto:

| | Hypelist | APPINITY |
|---|---|---|
| Origen de los gustos | Lo que el usuario escribe a mano en listas | Fuentes externas conectadas (Steam, Google, YouTube, Trakt…) sin esfuerzo |
| A quién sigues | Amigos y creadores que eliges | **Almas gemelas calculadas**: gente que no conoces con tus mismos gustos, por categoría |
| Por qué te recomienda algo | Está en una lista o lo sugiere la IA | Motivo verificable: «lo valoraron muy bien 2 de tus almas gemelas», «del director de…» |
| Conocer gente | Comentarios en listas | Afinidad, amistad y chat con tus almas gemelas |
| Esfuerzo inicial | Alto: hay que crear listas | Bajo: conectar una fuente |
| Riesgo principal | Que la gente no mantenga sus listas | Acceso a las fuentes (Meta bloqueado, Google con scopes restringidos) y efecto red |

## En qué me diferencio

1. **Cero esfuerzo**: el perfil se construye solo con lo que ya haces en otras plataformas.
2. **Afinidad medida y explicada**: no recomiendan «influencers», sino personas cuyo gusto coincide con el tuyo en esa
   categoría.
3. **Descubrir personas**, no solo cosas: la afinidad es la puerta a conocer gente.
4. **Recomendaciones honestas**: sin gustos inventados por tocar botones; cada motivo se puede comprobar.

## Qué aprender y cómo implementarlo (sin romper las reglas de producto)

| Idea de Hypelist | Cómo encaja en APPINITY | Esfuerzo |
|---|---|---|
| **Objetos compartibles** (listas con enlace) | «Tu top» automático por categoría, generado desde tus fuentes, compartible por enlace o imagen. Crecimiento con cada envío | Medio |
| **Mapa** («Hype Map») | Mapa de restaurantes y cultura recomendados cerca, con los lugares que ya tenemos geolocalizados | Medio |
| **Listas colaborativas** | «Planes» con un amigo: lo que os gusta a los dos (intersección de recomendaciones). No cambia gustos | Medio |
| **Pulido y presencia en tiendas** | El Editors' Choice premia el diseño: el rediseño en curso va en esa línea | En curso |
| **Asistente de IA** | Fuera por ahora: la especificación pide un motor determinista y explicable | — |
| **Entrada manual** (escribir listas) | Contradice la regla «los gustos solo vienen de fuentes externas». Solo con una decisión explícita del titular, como fuente «declarada» y marcada como tal | Decisión |

## ¿Vale la pena seguir?

**Sí, con condiciones.**

A favor:
- Hypelist **no está consolidada**: 443 valoraciones en casi dos años es poca tracción, y no hay cifras de usuarios ni
  de financiación. El mercado de «recomendaciones sociales» sigue abierto (Letterboxd demuestra que un vertical bien
  hecho funciona).
- La apuesta es distinta: Hypelist pide esfuerzo; APPINITY lo elimina y añade el descubrimiento de personas.

En contra (los riesgos reales no son Hypelist):
- **Acceso a las fuentes**: Instagram cerrado, Facebook sin poder darte de alta como desarrollador, Google con scopes que
  exigen evaluación de pago para producción. Sin fuentes no hay perfil.
- **Efecto red**: sin otros usuarios no hay almas gemelas ni consenso.

Prueba propuesta antes de invertir más (criterios para seguir o parar):
1. 10–20 personas conocidas conectan al menos una fuente.
2. Medir: ¿las recomendaciones les parecen acertadas (≥ 60 % «me interesa»)? ¿Abren el perfil de alguna alma gemela?
   ¿Vuelven a la semana?
3. Si no se cumple, replantear el producto (por ejemplo, añadir entrada declarada) antes de seguir con más fuentes.
