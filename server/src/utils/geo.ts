import { env } from '../config/env.js';
import { AppError } from './errors.js';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type GeoJsonPoint = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

export type GeoJsonLineString = {
  type: 'LineString';
  coordinates: [number, number][]; // [[longitude, latitude], ...]
};

/**
 * Validate that coordinates are valid numbers and fall within the pilot bounding box.
 * Also checks and rejects swapped [lat, lon] coordinates.
 */
export function validatePilotCoordinates(
  lat: number,
  lon: number,
  fieldName = 'location'
): void {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    throw AppError.validation([
      { field: fieldName, issue: 'Coordinates must be valid numbers.' },
    ]);
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw AppError.validation([
      { field: fieldName, issue: 'Latitude must be in [-90, 90] and longitude in [-180, 180].' },
    ]);
  }

  // Check if coordinates appear to be swapped
  if (
    lat >= env.PILOT_BBOX_MIN_LON &&
    lat <= env.PILOT_BBOX_MAX_LON &&
    lon >= env.PILOT_BBOX_MIN_LAT &&
    lon <= env.PILOT_BBOX_MAX_LAT
  ) {
    throw AppError.validation([
      {
        field: fieldName,
        issue: 'Coordinates appear to be swapped: latitude matches longitude pilot range.',
      },
    ]);
  }

  // Validate within pilot bounding box
  if (
    lat < env.PILOT_BBOX_MIN_LAT ||
    lat > env.PILOT_BBOX_MAX_LAT ||
    lon < env.PILOT_BBOX_MIN_LON ||
    lon > env.PILOT_BBOX_MAX_LON
  ) {
    throw AppError.validation([
      {
        field: fieldName,
        issue: `Coordinates (${lat}, ${lon}) fall outside the configured pilot bounding box [lat: ${env.PILOT_BBOX_MIN_LAT}..${env.PILOT_BBOX_MAX_LAT}, lon: ${env.PILOT_BBOX_MIN_LON}..${env.PILOT_BBOX_MAX_LON}].`,
      },
    ]);
  }
}

/**
 * Convert { latitude, longitude } to GeoJSON Point [longitude, latitude]
 */
export function toGeoJsonPoint(latLng: LatLng, validatePilot = true, fieldName = 'location'): GeoJsonPoint {
  if (validatePilot) {
    validatePilotCoordinates(latLng.latitude, latLng.longitude, fieldName);
  }
  return {
    type: 'Point',
    coordinates: [latLng.longitude, latLng.latitude],
  };
}

/**
 * Convert GeoJSON coordinates [longitude, latitude] to public { latitude, longitude }
 */
export function fromGeoJsonPoint(coords: [number, number]): LatLng {
  return {
    longitude: coords[0]!,
    latitude: coords[1]!,
  };
}
