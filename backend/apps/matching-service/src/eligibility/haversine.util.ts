/**
 * Haversine distance utility for geographic eligibility filtering.
 * Calculates the great-circle distance between two geographic coordinates in kilometers.
 *
 * Formula:
 * a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
 * c = 2 * atan2(√a, √(1-a))
 * d = R * c (where R = 6371 km)
 */

const EARTH_RADIUS_KM = 6371.0;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180.0;
}

export function validateCoordinates(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90.0 &&
    lat <= 90.0 &&
    lon >= -180.0 &&
    lon <= 180.0
  );
}

export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (!validateCoordinates(lat1, lon1) || !validateCoordinates(lat2, lon2)) {
    throw new Error(
      `Invalid geographic coordinates: (${lat1}, ${lon1}) -> (${lat2}, ${lon2})`,
    );
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c * 1000) / 1000; // 3 decimal places (meters)
}
