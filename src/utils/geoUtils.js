/**
 * Calcula la distancia entre dos puntos en metros usando la fórmula de Haversine.
 */
export const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distancia en metros
};

/**
 * Genera coordenadas aleatorias dentro de un radio aproximado en metros.
 */
export const generateRandomCoordinates = (centerLat, centerLon, radiusInMeters = 50) => {
  const treasures = [];
  
  for (let i = 0; i < 3; i++) {
    // 1 grado de latitud ~ 111,320 metros
    // 1 grado de longitud ~ 111,320 * cos(lat) metros
    const r = radiusInMeters / 111320;
    const u = Math.random();
    const v = Math.random();
    const w = r * Math.sqrt(u);
    const t = 2 * Math.PI * v;
    const x = w * Math.cos(t);
    const y = w * Math.sin(t);

    // Ajuste para la longitud basado en la latitud
    const xDelta = x / Math.cos((centerLat * Math.PI) / 180);

    treasures.push({
      latitude: centerLat + y,
      longitude: centerLon + xDelta,
      encontrado: 0
    });
  }
  
  return treasures;
};
