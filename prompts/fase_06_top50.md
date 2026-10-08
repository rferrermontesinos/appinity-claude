# Fase 6 Top 50

Lee CLAUDE.md, docs/APPINITY_Especificacion.md, docs/decisions.md y docs/progress.md. Trabaja exclusivamente en appinity-claude.

Implementa únicamente la fase 6: ranking de almas gemelas y Top 50 gratuito. Usa el motor real de afinidad y los usuarios elegibles, con orden estable y confianza.

Excluye al propio usuario, cuentas no elegibles y bloqueos en ambas direcciones. Si hay menos de 50 candidatos válidos, muestra los que existan. Verifica el ranking contra un cálculo exhaustivo en datasets pequeños y no pierdas candidatos relevantes en el prefiltro.

Entrega perfil público mínimo y afinidades por categoría con NULL visible como raya. El historial personal importado no debe aparecer en el DTO público. Incluye casos con más y menos de 50 perfiles sintéticos. Ejecuta comprobaciones, actualiza progreso y guarda cambios en GitHub.
