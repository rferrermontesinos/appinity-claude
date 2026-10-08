# Fase 7 Recomendador y Trending

Lee CLAUDE.md, docs/APPINITY_Especificacion.md, docs/decisions.md y docs/progress.md. Trabaja exclusivamente en appinity-claude.

Implementa la fase 7: candidatos y mezcla objetivo 70/20/10. El consenso utiliza solo Top 50 con igual peso por persona. El descubrimiento individual identifica a una persona realmente afín. No inventes apoyos para completar cuotas.

Trending utiliza ratings explícitos externos de usuarios de la misma zona sin peso por afinidad. Cuenta votantes únicos, mínimos configurables y fechas de actividad del año actual. Aplica las reglas de estreno/publicación y la interpretación propuesta para entidades permanentes; no confundas syncedAt con fecha de voto. Comprueba cambio de año, falta de fechas y ausencia de ubicación.

Excluye conocidos, descartes de Home, duplicados de sesión y objetos locales fuera del radio. Usa fallbacks con motivos veraces. Prueba que la persona 51 no influye en consenso y que los swipes no alteran gustos. Versiona resultados, documenta y guarda en GitHub.
