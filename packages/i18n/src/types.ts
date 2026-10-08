import type { es } from './es.js';

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Estructura de textos: todos los idiomas deben definir exactamente las mismas claves que `es`. */
export type TranslationResources = Widen<typeof es>;
