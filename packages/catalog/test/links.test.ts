import { describe, expect, it } from 'vitest';
import { publicLinks } from '../src/links.js';

describe('enlaces públicos de un objeto', () => {
  it('juegos: Steam primero, desde su ID; Wikidata al final', () => {
    const links = publicLinks('games', [{ provider: 'wikidata', idType: 'entity', value: 'Q123' }, { provider: 'steam', idType: 'app', value: '400' }], []);
    expect(links.map((l) => l.url)).toEqual(['https://store.steampowered.com/app/400/', 'https://www.wikidata.org/wiki/Q123']);
  });

  it('música: Spotify antes que Apple Music y la Wikipedia guardada', () => {
    const links = publicLinks(
      'music',
      [{ provider: 'apple_music', idType: 'artist', value: '295015' }, { provider: 'spotify', idType: 'artist', value: '4q3ewBCX7sLwd24euuV69X' }],
      [{ provider: 'wikipedia', url: 'https://es.wikipedia.org/wiki/Radiohead' }],
    );
    expect(links.map((l) => l.provider)).toEqual(['spotify', 'apple_music', 'wikipedia']);
  });

  it('un ID con formato inesperado o interno no genera enlace; tampoco un enlace guardado sin https', () => {
    const links = publicLinks(
      'games',
      [{ provider: 'steam', idType: 'app', value: '400/../evil' }, { provider: 'steam', idType: 'item', value: 'app:1' }, { provider: 'fixture_play', idType: 'item', value: 'x' }],
      [{ provider: 'website', url: 'http://inseguro.example' }],
    );
    expect(links).toEqual([]);
  });

  it('lugares: Google Maps por su CID; sin él, búsqueda por nombre y localidad (o, sin localidad, por coordenadas)', () => {
    expect(publicLinks('food', [{ provider: 'google_maps', idType: 'cid', value: '4226397108067053575' }], [])[0]?.url).toBe('https://maps.google.com/?cid=4226397108067053575');
    expect(publicLinks('food', [], [], { name: 'Lasarte', latitude: 41.3937, longitude: 2.1621, locality: 'Barcelona' })[0]?.url).toBe('https://www.google.com/maps/search/?api=1&query=Lasarte%2C%20Barcelona');
    expect(publicLinks('food', [], [], { name: 'X', latitude: 41.3937, longitude: 2.1621, locality: null })[0]?.url).toBe('https://www.google.com/maps/search/?api=1&query=41.393700%2C2.162100');
    expect(publicLinks('movies', [], [], { name: 'X', latitude: 41, longitude: 2, locality: 'Barcelona' })).toEqual([]);
  });

  it('no duplica proveedor: el enlace guardado manda sobre el derivado', () => {
    const links = publicLinks('movies', [{ provider: 'imdb', idType: 'title', value: 'tt1254207' }], [{ provider: 'imdb', url: 'https://www.imdb.com/title/tt1254207/' }]);
    expect(links).toHaveLength(1);
  });
});
