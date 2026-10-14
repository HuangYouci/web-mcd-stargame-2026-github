/** places.json 精簡格式的解碼，網站與測試共用。 */

/**
 * @param {{ cities: string[], categories: string[], places: Array<Array<number | string>> }} raw
 */
export function decodePlaces(raw) {
  return {
    ...raw,
    places: raw.places.map(([id, cat, name, city, points, address, query, note]) => ({
      id,
      cat,
      name,
      city: raw.cities[city] ?? '',
      points,
      address,
      query: query || address,
      note: note || '',
    })),
  };
}
