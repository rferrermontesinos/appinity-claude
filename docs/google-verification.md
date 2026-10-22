# Verificación de Google (fase 13)

Estado: **preparada, no solicitada**. La app sigue en modo Testing: hasta 100 usuarios de prueba y permisos de Data
Portability de 7 días. Requisitos consultados el 2026-10-22 en la
[ayuda de verificación](https://support.google.com/cloud/answer/13464321), la
[política de Data Portability](https://developers.google.com/data-portability/policy) y la
[tabla de scopes](https://developers.google.com/data-portability/user-guide/scopes).

## Scopes que pide APPINITY

Todos se piden en «Continuar con Google» salvo Data Portability: Google no permite mezclarlo con otros scopes, así que
va en su propio consentimiento.

| Scope | Clase | Para qué se usa (justificación para Google) | Coste de verificación |
|---|---|---|---|
| `openid`, `email`, `profile` | Básicos | Crear la cuenta e iniciar sesión | — |
| `books` | Sensible | Leer las estanterías para conocer los libros leídos, favoritos y pendientes | Gratis |
| `calendar.events.readonly` | Sensible | Detectar restaurantes, museos, teatros, conciertos y películas en los planes; solo se guarda lo identificado | Gratis |
| `dataportability.maps.reviews` | Sensible | Valoraciones de lugares (gustos explícitos) | Gratis |
| `dataportability.search_ugc.media.reviews_and_stars`, `.thumbs`, `.watched` | Sensible | Valoraciones, pulgares y «visto» de películas, series, libros, discos y juegos | Gratis |
| `dataportability.youtube.music`, `.youtube.subscriptions` | Sensible | Biblioteca de YouTube Music y suscripciones (artistas y podcasts conocidos) | Gratis |
| `dataportability.play.library` | Sensible | Juegos y libros de Google Play | Gratis |
| `dataportability.order_reserve.purchases_reservations` | Sensible | Reservas en restaurantes | Gratis |
| `dataportability.saved.collections` | Sensible | Lugares y obras guardados (solo conocimiento) | Gratis |
| `dataportability.myactivity.youtube` | **Restringido** | Escuchas en YouTube y YouTube Music (artistas y programas) | **Evaluación CASA anual, de pago** |
| `dataportability.maps.starred_places` | **Restringido** | Lugares destacados en Maps | **Evaluación CASA anual, de pago** |

**Decisión (sin pagos)**: `GOOGLE_RESTRICTED_SCOPES` vale `false` por defecto con `NODE_ENV=production`, así que
producción pide solo los scopes sensibles. Se pierden las escuchas de YouTube y los destacados de Maps. La biblioteca
de YouTube Music y las suscripciones siguen dando los artistas y programas conocidos. En desarrollo y Testing se piden
todos.

## Requisitos y estado

| Requisito | Estado | Cómo cumplirlo sin pagar |
|---|---|---|
| Página de inicio en un dominio propio verificado en Search Console | Pendiente | Un dominio propio cuesta unos 10 € al año. Alternativa gratuita: GitHub Pages (`rferrermontesinos.github.io`), que figura en la Public Suffix List y se puede verificar en Search Console |
| Política de privacidad en el mismo dominio, enlazada desde la portada y la pantalla de consentimiento | Pendiente (borrador abajo) | Publicarla junto a la portada |
| Avisos de privacidad dentro de la app | Hecho en parte: el alta y las fuentes explican qué se lee | Revisar los textos con la política |
| Vídeo de demostración con el flujo completo y la pantalla de consentimiento en inglés | Pendiente | Grabarlo con la app en inglés (la i18n ya existe) |
| Scopes mínimos y justificados | Hecho (tabla de arriba) | — |
| Marca de los botones de Google | Revisar | El botón «Continuar con Google» debe seguir las guías de marca |
| Limited Use: datos solo para la función visible y sin transferencias | Diseño conforme | Ver la nota de abajo |

## Nota sobre Limited Use

Google prohíbe transferir los datos, incluidos los derivados, salvo para funciones que el usuario consiente. En
APPINITY:
- otras personas solo ven el **perfil mínimo**: nombre, país, foto y cifras de afinidad;
- ninguna persona ve los historiales de otra;
- las recomendaciones de consenso se calculan en agregado.

La política de privacidad y el alta deben decir claramente que la afinidad se calcula con los gustos importados y se
muestra a otros usuarios como porcentaje. Sin publicidad ni venta de datos.

## Borrador de la política de privacidad (puntos obligatorios)

1. Qué datos de Google se leen, por scope (tabla de arriba), y que el acceso es de solo lectura.
2. Para qué: construir el perfil de gustos, calcular afinidades y recomendar. Nada más.
3. Qué se guarda: solo las evidencias identificadas (objeto, fecha, valoración o conocimiento). Nunca títulos de
   eventos, textos de reseñas ni historiales completos.
4. Con quién se comparte: con nadie. Otras personas ven el perfil mínimo y los porcentajes de afinidad.
5. Cómo borrar: «Eliminar mi cuenta» en la app (borrado en cascada) y retirar el acceso en
   myaccount.google.com/connections.
6. Declaración de Limited Use de la política de datos de usuario de las APIs de Google.
7. Contacto del responsable.

## Siguiente paso

Decidir el dominio (propio o GitHub Pages). Con eso se puede publicar la portada y la política, y grabar el vídeo.
