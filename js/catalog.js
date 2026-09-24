// Lectura del catálogo de personajes (characters/index.json) y de la ficha de cada uno.

const INDEX_URL = 'characters/index.json';

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`No se pudo leer ${url} (${response.status})`);
  return response.json();
}

/** Devuelve la lista de personajes registrados por el script de exportación. */
export async function loadCatalog() {
  const index = await fetchJson(INDEX_URL);
  return index.characters ?? [];
}

/** Devuelve la ficha completa (modelo, animaciones, altura) de un personaje. */
export function loadManifest(entry) {
  return fetchJson(entry.manifest);
}
