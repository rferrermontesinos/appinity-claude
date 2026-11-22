# Beta de APPINITY · estado y lo que falta (fase 13, 2026-10-15)

## Recorrido extremo a extremo y su estado

| Paso | Estado | Cómo se ha comprobado |
|---|---|---|
| Entrar con Google (producción) | **Implementado** | Tests: OpenID Connect con claves locales (firma, emisor, audiencia, caducidad, nonce) y HTTP (código de un solo uso, rotación, cierre de sesión). Vista web: botón visible, canje del código, alta y Perfil. **Probado con Google real en el PC (2026-10-15)**: cuenta `live` creada con email verificado, alta completada y sesión activa |
| Alta: mayoría de edad y condiciones | **Implementado** | Test HTTP y vista web (alta → Perfil) |
| Conectar fuentes (único consentimiento) | Google y Steam implementados | Sync real de Google con tu cuenta: 115 evidencias. Steam: fases anteriores |
| Sync, perfil, afinidades, recomendaciones | Implementados | Fases 2 a 11, con datos reales |
| Chat, amigos, bloqueo, reporte | Implementados | Fases 10 y 12A, aceptadas en el teléfono |
| Desconexión y eliminación de cuenta | **Implementado** | Test HTTP y vista web: eliminar borra usuario, identidad y sesiones, y vuelve al login |
| Premium | Servidor listo | Webhooks probados con eventos simulados; sin compra real |
| Notificaciones | Servidor listo, con recibos | Envío y recibos simulados; sin entrega real |
| Despliegue | Preparado | Pila de producción levantada en local; copia de seguridad y restauración probadas |

## Lo que falta antes de una beta real (requiere tus cuentas o decisiones)

1. **Dominio con HTTPS y un servidor**: un VPS pequeño basta para la beta. Sin él, Google solo vuelve a `localhost` y el
   teléfono no puede iniciar sesión.
2. **Google Cloud**:
   - autorizar las URL de vuelta de producción, la de inicio de sesión y la de Data Portability;
   - **verificación de la app**: los scopes «Restricted» de Data Portability exigen la evaluación de seguridad (CASA)
     para salir del modo Testing. En Testing el permiso dura 7 días y solo para usuarios de prueba.
3. **EAS** (`eas init`) y una **build de desarrollo o preview** instalada en Android. Es imprescindible para el push y
   las compras.
4. **Firebase (FCM V1)** para el push en Android.
5. **Opcional**: RevenueCat y las tiendas para Premium; Apple Developer Program para iOS («Iniciar sesión con Apple»
   es obligatorio en iOS si se ofrece Google).
6. **Textos legales**: condiciones y política de privacidad (el alta ya pide aceptarlas).

## Nota sobre cuentas (2026-10-15)

La cuenta de Google es nueva y está vacía; los gustos del usuario siguen en su cuenta local de desarrollo. Pasar fuentes a otra cuenta tiene dos límites:
- Google: un export por grupo cada 24 h.
- Steam: una cuenta de Steam solo puede estar vinculada a un usuario a la vez.

## Probar el inicio de sesión real en el PC (hecho)

1. En Google Cloud → tu cliente OAuth → «URIs de redireccionamiento autorizados», añade
   `http://localhost:3100/v1/auth/google/callback`.
2. Reinicia la API: `AUTH_SECRET` ya está generado en tu `.env`.
3. En `http://localhost:8092`, cierra la sesión de desarrollo («Cambiar de usuario») y pulsa «Continuar con Google».

## Auditoría de seguridad de la API (2026-10-26)

Revisión de todas las rutas de `apps/api` (sin herramientas externas):

- **Sesión**: un guard global exige sesión en todo lo que no se marca `@Public()`. Las públicas son: salud, inicio de
  sesión con Google, imágenes del catálogo (solo `catalog/`, sin datos personales), retorno de las fuentes (con `state`),
  el webhook de RevenueCat (secreto comparado en tiempo constante) y el acceso de desarrollo, que la configuración
  prohíbe con `NODE_ENV=production`.
- **Autorización por recurso**: conexiones, perfiles propios, solicitudes de amistad y de chat, conversaciones,
  afinidades y catálogo filtran por el usuario de la sesión y su dataset. Un recurso ajeno responde 404. Hay tests para
  conexiones, evidencias, afinidades, bloqueos y, desde esta revisión, para responder solicitudes ajenas y leer, marcar
  o borrar una conversación ajena.
- **Secretos**: ningún `.env`, clave ni copia de seguridad en Git; los tests usan valores simulados; ningún log
  escribe tokens.
- **Arreglado**: detrás del proxy HTTPS todas las peticiones llegaban con la IP del proxy, así que el límite de
  peticiones (300 por minuto y IP) se habría repartido entre todos los usuarios. Ahora `TRUST_PROXY` (en
  `docker-compose.prod.yml`: `loopback, uniquelocal`) permite leer la IP real. Solo admite rangos o subredes, nunca
  «confiar en todo».
- **Pendiente con servidor real**: revisar las cabeceras del proxy (HSTS) y repetir la revisión con la evaluación CASA
  de Google.
