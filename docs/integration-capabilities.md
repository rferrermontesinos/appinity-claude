# Capacidades de integración · APPINITY Claude

Estado verificado de cada fuente. **Nada en esta tabla está disponible hasta que su fila lo diga con
evidencia.** Las capacidades de un manifest solo reflejan lo comprobado en documentación oficial y en una
conexión real.

| Fuente | Categorías | Autenticación | Estado | Evidencia |
|---|---|---|---|---|
| Steam | games | OpenID (identificación) + Web API key (datos). No OAuth | Pendiente · fase 2 | Ficha por crear con la documentación oficial de Valve |
| TMDb | movies, series | Por verificar | Pendiente · fase 3 | — |
| Last.fm | music | Por verificar | Pendiente · fase 4 | — |
| Google Activity / Data Portability | potencialmente las ocho | Por verificar | Pendiente · fase 11 | — |
| Apple Music | music | Por verificar | Pendiente · fase 11 | — |
| SoundCloud, Plex, Google Books, Podchaser, Eventbrite, calendario del dispositivo | ver especificación §9 | Por verificar | Pendiente · fase 11 | — |

Antes de implementar cada fuente se añadirá su ficha: documentación oficial, endpoints, scopes, aprobación,
paginación, límites, permisos de almacenamiento y política de revocación.
