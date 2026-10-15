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
