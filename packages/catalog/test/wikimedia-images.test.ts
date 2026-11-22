import { describe, expect, it } from 'vitest';
import { pickImageClaim } from '../src/wikimedia-images.js';

const claims = (props: Record<string, string>) =>
  Object.fromEntries(Object.entries(props).map(([p, v]) => [p, [{ mainsnak: { datavalue: { value: v } } }]]));

describe('imagen representativa por categoría (Wikidata)', () => {
  it('en cine: cartel antes que logotipo, y nunca la foto genérica (reparto, estreno, rodaje)', () => {
    expect(pickImageClaim(claims({ P18: 'Reparto.jpg', P3383: 'Cartel.jpg', P154: 'Logo.png' }), 'movies')).toEqual({ file: 'Cartel.jpg', kind: 'poster' });
    expect(pickImageClaim(claims({ P18: 'Reparto.jpg', P154: 'Logo.png' }), 'movies')).toEqual({ file: 'Logo.png', kind: 'logo' });
    expect(pickImageClaim(claims({ P18: 'InceptionCast.jpg' }), 'movies')).toBeNull();
    expect(pickImageClaim(claims({ P18: 'Rodaje.jpg' }), 'series')).toBeNull();
  });

  it('en podcasts, logotipo antes que foto; en el resto, foto antes que logotipo', () => {
    expect(pickImageClaim(claims({ P18: 'Presentador.jpg', P154: 'Logo.jpg' }), 'podcasts')).toEqual({ file: 'Logo.jpg', kind: 'logo' });
    expect(pickImageClaim(claims({ P18: 'Artista.jpg', P154: 'Logo.png' }), 'music')).toEqual({ file: 'Artista.jpg', kind: 'photo' });
    expect(pickImageClaim(claims({ P154: 'Logo.png' }), 'food')).toBeNull();
  });

  it('un SVG siempre se trata como logotipo', () => {
    expect(pickImageClaim(claims({ P18: 'Grupo.svg' }), 'music')).toEqual({ file: 'Grupo.svg', kind: 'logo' });
  });
});
