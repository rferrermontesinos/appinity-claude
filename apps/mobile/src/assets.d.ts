/** Imágenes empaquetadas por Metro: `import x from '...png'` devuelve el identificador del recurso. */
declare module '*.png' {
  const asset: number;
  export default asset;
}
