# Fase 3 TMDb

Lee CLAUDE.md, docs/APPINITY_Especificacion.md, docs/decisions.md y docs/progress.md. Trabaja exclusivamente en appinity-claude.

Implementa únicamente la fase 3 de APPINITY: TMDb. Comprueba en documentación oficial el flujo de cuenta y las señales personales disponibles. Separa la autenticación de catálogo de la autorización del usuario.

Usa el adapter común para movies y series. Importa ratings, favoritos o listas únicamente cuando sean accesibles; no inventes un historial de vistos. Normaliza la escala real de ratings y conserva la diferencia entre guardado, consumido y preferencia. Resuelve IDs sin confundir películas y series ni duplicar objetos que vengan de otras fuentes. Incluye imagen y atribución conforme a sus condiciones.

Guíame para conectar mi cuenta, comprueba idempotencia y desconexión, ejecuta pruebas y actualiza documentación y GitHub. Lo pendiente de permisos o credenciales debe quedar declarado.
