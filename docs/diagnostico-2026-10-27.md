# Diagnóstico de APPINITY · 2026-10-27

Revisión de todos los niveles frente a la especificación (v1.1 y decisiones del titular), con la BD local, los tests
(397 OK, 43 ficheros) y los documentos de beta, integraciones y fuentes. Sustituye las prioridades del
[diagnóstico del 22](diagnostico-2026-10-22.md), que ya están hechas casi todas.

## Respuestas directas

| Pregunta | Respuesta |
|---|---|
| ¿Se puede enviar a más gente? | **Sí, a una beta cerrada**: Android, con Gmail, hasta 100 personas. **No** a público ni a iPhone todavía |
| ¿Qué falta para empezar? | 4 cosas tuyas (dominio y túnel, usuarios de prueba en Google, tus datos en los textos legales, una vía de feedback) y 2 mías (fusionar los PR en `main` y generar el APK de beta) |
| ¿Cuánta gente? | En olas: **5–8** (fallos), **25–40** (¿salen almas gemelas?) y **hasta 100** (Trending y retención). Mejor grupos de amigos de la misma ciudad |
| ¿Base de datos? | **Ya existe** (PostgreSQL + PostGIS + Redis). La cuestión es dónde vive: en tu PC con túnel para las dos primeras olas; en un servidor para la tercera |

## 1. Estado por niveles

| Nivel | Estado | Pendiente |
|---|---|---|
| Motor (afinidad, Top 50, 70/20/10, contenido, Trending, votos v3) | ✅ Completo, con tests | **Sin validar con personas reales**: hoy hay 2 cuentas reales, 97 gustos reales y **0 afinidades reales**. Lo social solo se ha visto con la demo (13 usuarios simulados) |
| App móvil (4 pestañas, «Aura», ficha, accesibilidad) | ✅ Aceptada en el Android del titular | iPhone sin build ni prueba; sin pruebas automáticas en dispositivo |
| API y seguridad | ✅ Auditoría del 26-10, autorización por recurso, límites, secretos fuera de Git | HSTS y cabeceras del proxy en el servidor real |
| Catálogo | ✅ 260 obras reales y 132 de demo, con imágenes y sinopsis (Wikipedia) | TMDb (carteles) es de uso **no comercial**: vale para la beta, no para el lanzamiento |
| Fuentes | ✅ Google Data Portability (Maps, Búsqueda, YouTube, Play, reservas), Books, Calendar, Steam, Trakt, AniList, Facebook | Google en modo Testing (7 días, 100 personas). Facebook solo para quien añadas como probador. Trakt exige acuerdo comercial para producción |
| Infraestructura | 🟡 Todo en tu PC (Docker). Túnel de Cloudflare y APK de beta **preparados** | Falta el dominio. El PC tiene que estar encendido mientras dure la prueba |
| Repositorio | 🔴 `main` solo tiene el commit inicial; **23 PR abiertos y apilados** | Fusionar en orden antes de repartir el APK (CI ya existe en las ramas) |
| Observabilidad | 🔴 Nada (sin Sentry ni analítica) | Sin ella no verás los fallos en los teléfonos de otros ni podrás medir la beta |
| Legal | 🟡 Condiciones y privacidad en borrador, publicadas y enlazadas en el alta | Responsable, contacto y revisión legal |
| Distribución | 🟡 `pnpm android:beta` genera un APK instalable | Sin Play Console ni TestFlight; las actualizaciones serán reenviar el APK |

## 2. Lo que falta de la especificación

| § | Requisito | Estado | ¿Bloquea la beta cerrada? |
|---|---|---|---|
| 14 | Login con Google, **Apple o email** | Solo Google | No (Android + Gmail). Sí para iPhone: Apple exige «Iniciar sesión con Apple» si se ofrece Google |
| 14 | Mensaje «Hemos encontrado tus primeras almas gemelas» | Solo existe «aprendiendo tus gustos» | No |
| 9/11 | Apple Music, calendario nativo, fuentes P2 (itch.io, SoundCloud, Eventbrite…) | Apple Music descartada (de pago); calendario cubierto por Google Calendar; P2 sin hacer | No |
| 12/16 | Premium en la app (RevenueCat y tiendas) | Solo servidor | No: la especificación permite «Premium desbloqueado durante Early Access» |
| 12/16 | Push en el móvil (FCM/APNs) | Solo servidor | No, pero sin push baja la retención. Necesita EAS y Firebase |
| 16 | Horario tranquilo de las notificaciones | No implementado (era una propuesta) | No |
| 15 | Observabilidad (Sentry y PostHog con datos mínimos) | No implementada | **Muy recomendable** antes de la ola 2 |
| 15 | Almacenamiento S3 de imágenes | Disco local (válido en un servidor) | No |
| 17 | Verificación de Google y CASA | Pendiente (modo Testing) | No hasta 100 personas; **sí** para pasar de 100 o quitar la caducidad de 7 días |
| 17 | Textos legales y revisión | Borrador sin responsable | **Sí** (tus datos como responsable) |
| 18 | Fase 13: builds, verificación, documentación operativa | APK listo; resto pendiente | En parte |
| 19 | Pruebas del flujo móvil en dispositivo, «no solo una captura web» | Sin automatizar (Maestro, Detox) | No; se suple con la prueba manual |
| — | RGPD: acceso y portabilidad (exportar mis datos) | No implementado (sí la eliminación) | Recomendable; obligatorio atender la petición si alguien la hace |

Cambios conscientes respecto a la especificación (decisiones del titular, en decisions.md): los votos en la app sí
cambian los gustos (fuente `appinity`); afinidad simétrica; guardar eliminado (motor v3).

## 3. ¿Podemos abrir la prueba?

**Sí, en beta cerrada**, cuando estén estos bloqueantes:

1. **Dominio + túnel** (tú): comprar el dominio en Cloudflare (~10 €/año), `cloudflared tunnel login` y
   `pnpm tunnel:setup -Domain tudominio.com` ([beta.md](beta.md)).
2. **Google Cloud** (tú): las 3 URL de vuelta, el dominio autorizado y el **Gmail de cada persona** como usuario de prueba.
3. **Textos legales** (tú): nombre y contacto del responsable. Es un tratamiento de datos personales de terceros
   (gustos, historial, ubicación aproximada, contactos con hash); el RGPD se aplica aunque sean amigos.
4. **Repositorio estable** (yo): fusionar los 23 PR en `main` y generar el APK de beta desde `main`.
5. **Vía de feedback** (tú): un grupo de WhatsApp o un formulario; mejor, un botón «Enviar comentario» en Perfil.

**Muy recomendable antes de la ola 2**: informe de fallos (Sentry, plan gratuito), analítica mínima (PostHog, plan
gratuito, sin datos personales), copias de seguridad diarias fuera del PC (ya hay script de backup y restauración) y
**push** (EAS + Firebase, gratis).

Lo que verán los probadores: el aviso «Google no ha verificado esta app» (hay que pulsar «Continuar»), instalar un APK
de origen desconocido y volver a autorizar Google cada 7 días.

## 4. Cuánta gente y por qué

El valor de APPINITY depende de la densidad de gustos compartidos, no solo del número de personas:

- **Almas gemelas**: necesitan obras en común con preferencia; con pocas fuentes conectadas no salen.
- **Consenso**: hacen falta **≥ 2 almas gemelas** con gusto ≥ 0,5 (confianza ≥ 0,5) en una obra que no conoces; el
  Top 50 solo se llena con más de 50 personas comparables.
- **Trending**: **≥ 5 personas de tu zona** (10 km) con votos explícitos de este año sobre la misma obra. En una ciudad
  hace falta mucha más densidad que para el resto.
- **Usabilidad**: 5 personas por ronda encuentran la mayoría de los problemas de uso.

| Ola | Personas | Duración | Objetivo | Se considera superada si… |
|---|---|---|---|---|
| 1 · Alfa | 5–8 de confianza | 1 semana | Instalación, alta, importación de Google, fallos | Todos completan el alta y ven gustos importados en < 24 h |
| 2 · Beta cerrada | 25–40, en 3–5 grupos de amigos de la misma ciudad | 2–3 semanas | ¿Salen almas gemelas y recomendaciones con sentido? | ≥ 50 % con al menos 1 alma gemela en 48 h; ≥ 30 % de tarjetas de Inicio de consenso o descubrimiento; votos por sesión estables |
| 3 · Beta ampliada | hasta 100 (límite de Google en Testing) | 3–4 semanas | Trending local, notificaciones, retención | Retención a 7 días ≥ 30 %; Trending activo en la ciudad principal |

Para pasar de 100 personas hay que verificar la app de Google (y CASA, de 540 a 4.500 USD/año) o dejar de pedir
los scopes restringidos.

## 5. Base de datos e infraestructura

La BD ya existe y está aislada (PostgreSQL 5442, Redis 6390, datasets `demo` y `live` separados). Opciones para la beta:

| Opción | Coste | Para | Riesgos |
|---|---|---|---|
| **Tu PC + Cloudflare Tunnel** (preparado) | Solo el dominio, ~10 €/año | Olas 1 y 2 | El PC debe estar encendido 24 h (syncs, chat); un fallo del disco pierde la beta si no hay copia fuera |
| **VPS con `docker-compose.prod.yml`** (preparado y probado en local) | ~5–15 €/mes + dominio | Ola 3 y lanzamiento | Mantenimiento del servidor (actualizaciones, copias) |
| BD gestionada + VPS para API y worker | 15–40 €/mes | Más adelante | Más piezas que configurar |

Recomendación: PC + túnel para empezar ya, con copia diaria cifrada fuera del PC, y pasar a un VPS antes de la ola 3.
Contratar el servidor necesita una tarea específica (CLAUDE.md).

## 6. Requisitos completos y costes

| Requisito | Para | Coste | Estado |
|---|---|---|---|
| Dominio (Cloudflare) | Beta | ~10 €/año | Pendiente (tú) |
| Cloudflare Tunnel | Beta en tu PC | Gratis | Preparado |
| Google Cloud: probadores, URL de vuelta, dominio | Beta | Gratis | Pendiente (tú) |
| Textos legales con responsable | Beta | Gratis (revisión legal: variable) | Borrador |
| EAS + Firebase (push) | Ola 2 | Gratis | Pendiente (tú: cuentas) |
| Sentry y PostHog (planes gratuitos) | Ola 2 | Gratis | No implementado |
| VPS | Ola 3 | ~5–15 €/mes | Preparado (compose de producción) |
| Google Play Console | Distribuir por Play (actualizaciones automáticas) | 25 USD una vez | Opcional. Para publicar en producción, las cuentas personales nuevas exigen una prueba cerrada con ≥ 12 probadores durante 14 días |
| Apple Developer + «Iniciar sesión con Apple» | iPhone | 99 USD/año + desarrollo | No hecho |
| Verificación de Google + CASA | > 100 personas o sin caducidad de 7 días | 540–4.500 USD/año | No iniciada |
| Facebook: App Review y verificación del negocio | Facebook para todos | Gratis (proceso) | En beta: añadir a cada persona como probador |
| Licencia de carteles (TMDb) o quitarlos | Lanzamiento comercial | Según TMDb | Activo con atribución (no comercial) |
| Acuerdo comercial con Trakt o quitarlo | Lanzamiento comercial | Según Trakt | Activo |

## 7. Riesgos principales

1. **Densidad**: con pocas fuentes conectadas o gustos muy distintos, la app solo enseña «porque te gusta X»; la ola 2
   lo dirá. Mitigación: grupos de amigos de la misma ciudad e invitaciones (ya hechas).
2. **Fricción de Google**: aviso de app no verificada, permiso de 7 días y un export cada 24 h.
3. **Fuente musical en producción**: sin CASA se pierde el historial de YouTube, casi toda la música.
4. **Cine y series**: siguen siendo las categorías con menos datos (Búsqueda de Google y Trakt).
5. **Operación**: todo en un PC y sin fusionar en `main`. Un fallo del equipo o de una rama apilada afecta a todos.
6. **Sin observabilidad**: los fallos en los teléfonos de otros no llegarán si no los cuentan.

## 8. Orden propuesto

1. Yo: fusionar los PR en orden en `main` (CI en verde) y añadir «Enviar comentario» y Sentry (gratis) en la app.
2. Tú: dominio, túnel y Google Cloud ([beta.md](beta.md)); tus datos en los textos legales.
3. Yo: APK de beta desde `main`, prueba completa del alta desde tu teléfono y guía corta para probadores.
4. Ola 1 (5–8 personas) → arreglos → ola 2 (25–40) con push y analítica → decisión sobre VPS, verificación de Google y
   la ola 3.
