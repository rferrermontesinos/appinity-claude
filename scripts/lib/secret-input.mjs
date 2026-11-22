// Limpieza de secretos introducidos en la terminal o leídos del portapapeles.
// Al pegar en modo «raw», algunas terminales envían marcadores de pegado (ESC[200~ … ESC[201~), saltos de línea o
// caracteres de control que no forman parte de la clave.

// Los caracteres de control en estas expresiones son intencionados: es justo lo que hay que eliminar.
// eslint-disable-next-line no-control-regex
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/** Quita secuencias ANSI, caracteres de control y espacios. Nunca registra el valor. */
export function sanitizeSecret(raw) {
  return String(raw)
    .replace(ANSI_SEQUENCE, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\s]/g, '');
}

/** Describe por qué un valor no es válido sin revelarlo (solo longitud y tipo de caracteres). */
export function describeInvalid(value, pattern) {
  const nonHex = [...value].filter((c) => !/[0-9a-f]/i.test(c)).length;
  return `Se recibieron ${value.length} caracteres${nonHex ? ` (${nonHex} no hexadecimales)` : ''}; el formato esperado es ${pattern}.`;
}
