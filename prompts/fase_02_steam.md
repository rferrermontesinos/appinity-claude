# Fase 2 Steam

Lee CLAUDE.md, docs/APPINITY_Especificacion.md, docs/decisions.md y docs/progress.md. Trabaja exclusivamente en appinity-claude.

He probado la demo y quiero continuar con la fase 2: Steam. Lee las instrucciones y el progreso actual.

Valida en documentación oficial el acceso a la actividad y la autenticación de Steam, y explica qué configuración necesita mi cuenta. Implementa conexión, sync, normalización, resolución canónica, guardado, consolidación y desconexión mediante ProfileSourceAdapter. Quiero usar mi cuenta real para la integración y usuarios simulados claramente marcados para otros tests.

Comprueba que un juego comprado con 0 horas no esté consumido ni genere preferencia y que repetir el sync no duplique datos. Gestiona perfiles inaccesibles, rate limits y fallos parciales. Dime cómo aportar credenciales sin pegarlas en el chat. Si faltan, completa los fixtures y declara la conexión real pendiente. Ejecuta las comprobaciones, actualiza documentación y sube los cambios a GitHub.
