# Comparar Codex y Claude

Comparar entregas de igual alcance: primero fases 0–1, después una fuente real y después fases 5–9. Una versión con más fases no gana automáticamente. No proporcionar el código de Codex a Claude durante su construcción independiente.

Conservar la misma especificación de producto. Para pruebas reproducibles fijar reloj y zona horaria, conjunto de entradas, parámetros de afinidad y Trending, perfiles, ubicación y radio. Las versiones concretas de librerías se registran; no forzar versiones incompatibles para igualarlas. Compartir entradas de prueba es válido, compartir implementación invalida la independencia pretendida.

Antes de comparar motores, crear un archivo neutral de datos sintéticos con semilla fija y casos esperados, e importarlo a ambas versiones mediante sus interfaces propias. No usar las capturas ni las afinidades constantes de una demo como referencia. Si una fórmula propuesta se calibró de forma diferente, repetir también con los mismos parámetros y registrar esa diferencia.

## Casos mínimos

1. Juego adquirido con cero horas: conocido, no consumido, preferencia NULL.
2. Watchlist y visto sin rating: ningún gusto inventado.
3. Rating negativo explícito frente a asistencia inferida: prevalencia correcta.
4. Un objeto presente en tres fuentes: una entidad y un votante por usuario.
5. Imagen ausente: fallback correcto en móvil.
6. Afinidad sin evidencia: NULL; con desacuerdo suficiente: 0; historiales desiguales: direccionalidad.
7. Más de 50 candidatos: usuario 51 no cambia consenso.
8. Trending: votantes locales, afinidad irrelevante, año dinámico, fecha del voto y mínimos.
9. Descartar/Keep/Undo/NEW: persistencia correcta sin alterar gustos; descarte no bloquea Categories.
10. Sincronizar dos veces, desconectar y eliminar: sin duplicados ni derivados obsoletos.
11. Recursos ajenos, bloqueos y DTO público: acceso y privacidad correctos.
12. Desde clon limpio: instalación y arranque siguiendo únicamente README.

| Criterio | Codex | Claude | Evidencia |
|---|---|---|---|
| Cumplimiento de requisitos | Pendiente | Pendiente | Casos y resultados |
| Prueba móvil real | Pendiente | Pendiente | Dispositivo, pasos, fallos |
| Integraciones reales | Pendiente | Pendiente | Conectar, sync, repetir, desconectar |
| Corrección del motor | Pendiente | Pendiente | Entradas iguales, resultados verificables |
| Facilidad de arranque | Pendiente | Pendiente | Clon limpio, tiempo, correcciones |
| Claridad y mantenimiento | Pendiente | Pendiente | Contratos, docs, límites conocidos |
| Rendimiento | Pendiente | Pendiente | Mismo dataset y entorno de medida |
| Esfuerzo del usuario | Pendiente | Pendiente | Intervenciones y tiempo registrados |

No asignar notas hasta comprobar evidencia. Separar fallos del código, falta de credenciales y restricciones del entorno.
