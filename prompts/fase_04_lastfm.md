# Fase 4 Last.fm

Lee CLAUDE.md, docs/APPINITY_Especificacion.md, docs/decisions.md y docs/progress.md. Trabaja exclusivamente en appinity-claude.

Implementa la fase 4 de APPINITY: Last.fm y agregación musical, según las capacidades verificadas en documentación oficial.

Agrega canciones y scrobbles por artista canónico. Distingue señales explícitas como loved tracks de frecuencia de escucha; usa transformaciones logarítmicas o percentiles del propio usuario con confianza documentada. Una escucha aislada no debe producir un gusto fuerte. Repetir el sync no debe contar dos veces la misma actividad.

Guíame para probar mi cuenta si tengo historial disponible. Si no lo tengo, utiliza fixtures identificados y deja clara la limitación. Incluye casos de artistas ambiguos, cursores y errores parciales. Ejecuta pruebas, actualiza progreso y guarda los cambios en GitHub.
