import type { IdentifiedEntity } from '@appinity/shared';
import { z } from 'zod';
import type { ResourceGroup } from './constants.js';

export const tokenResponseSchema = z.object({
  access_token: z.string().min(10),
  expires_in: z.number().optional(),
  refresh_token: z.string().min(10).optional(),
  /** Segundos de acceso que eligió el usuario (30 o 180 días; 7 en modo Testing). */
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const initiateResponseSchema = z.object({
  archiveJobId: z.string().min(1),
  accessType: z.string().optional(),
});

export const archiveStateSchema = z.object({
  state: z.enum(['STATE_UNSPECIFIED', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'CANCELLED']),
  urls: z.array(z.string().url()).optional(),
  exportTime: z.string().optional(),
  startTime: z.string().optional(),
});
export type ArchiveState = z.infer<typeof archiveStateSchema>;

export const retryResponseSchema = z.object({ archiveJobId: z.string().min(1) });

export const accessTypeSchema = z.object({
  oneTimeResources: z.array(z.string()).optional(),
  timeBasedResources: z.array(z.string()).optional(),
});

export const googleErrorSchema = z.object({
  error: z
    .object({
      code: z.number().optional(),
      status: z.string().optional(),
      message: z.string().optional(),
      details: z.array(z.object({ reason: z.string().optional() }).passthrough()).optional(),
    })
    .passthrough(),
});

/** Lugar tal como llega en las exportaciones de Maps (GeoJSON, con o sin envoltorio `properties`). */
export interface ExportedPlace {
  name: string;
  address?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  mapsUrl?: string;
}

/** Comercio o lugar exportado sin coordenadas fiables (pedidos, reservas, guardados): se identifica por texto. */
export interface Venue {
  name: string;
  address?: string;
  /** Solo si el enlace de Maps las trae (`@lat,lng`). */
  latitude?: number;
  longitude?: number;
}

/** Registro ya extraído del archivo de un grupo. Nunca incluye el texto de las reseñas (minimización). */
export type ExportRecord =
  | { group: 'maps.reviews'; place: ExportedPlace; rating: number | null; hasText: boolean; date?: string }
  | { group: 'maps.starred_places'; place: ExportedPlace; date?: string }
  | { group: 'search_ugc.media.reviews_and_stars'; query: string; stars: number | null; date?: string }
  | { group: 'search_ugc.media.thumbs'; query: string; thumb: 'up' | 'down' | null; date?: string }
  | { group: 'search_ugc.media.watched'; query: string; date?: string }
  /** Escuchas agregadas de un artista o programa (puede reunir varios canales: el oficial y el «Topic»). */
  | { group: 'myactivity.youtube'; plays: number; musicPlays: number; channels: number; date?: string }
  | { group: 'youtube.subscriptions'; channels: number; date?: string }
  /** Canciones de un artista en la biblioteca de YouTube Music. */
  | { group: 'youtube.music'; songs: number; date?: string }
  /** Fase 11: un objeto de la biblioteca de Google Play (descargado o comprado). */
  | { group: 'play.library'; title: string; docType: 'book' | 'app' | 'movie' | 'series'; packageName?: string; date?: string }
  /** Fase 11: pedidos y reservas agregados por comercio (sin importes, platos ni pagos). */
  | { group: 'order_reserve.purchases_reservations'; venue: Venue; orders: number; reservations: number; date?: string }
  /** Fase 11: un lugar de Maps guardado en una o varias colecciones (sin notas ni comentarios). */
  | { group: 'saved.collections'; venue: Venue; lists: number; mapsUrl?: string; date?: string };

/** Registro que el sync entrega al mapper: el dato exportado y su identificación en el catálogo. */
export interface GoogleRecord {
  recordId: string;
  record: ExportRecord;
  identified: IdentifiedEntity;
}

export type { ResourceGroup };
