# Fase 5 Afinidades

Lee CLAUDE.md, docs/APPINITY_Especificacion.md, docs/decisions.md y docs/progress.md. Trabaja exclusivamente en appinity-claude.

Implementa la fase 5: motor de afinidad determinista, explicable, direccional y versionado. Lee las fórmulas y parámetros propuestos en la especificación; documenta su calibración.

Compara preferencias consolidadas, no simples vistos. Mantén NULL si no hay evidencia suficiente y permite 0 cuando exista desacuerdo real. Calcula cobertura según el usuario de origen, peso de categorías y confianza sin que los scrobbles dominen por duplicación.

Crea perfiles sintéticos diversos: muy afines, contrarios, categorías ausentes e historiales desiguales. No derives todos exclusivamente de mí. Demuestra que A -> B puede diferir de B -> A y que poca evidencia no produce porcentajes altos injustificados. No hardcodees afinidades. Ejecuta tests, documenta resultados y guarda cambios en GitHub.
