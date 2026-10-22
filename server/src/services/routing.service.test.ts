import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

const lineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

test('Kaali route geometry preserves GeoJSON [longitude, latitude] order', () => {
  const geometry = lineStringSchema.parse({
    type: 'LineString',
    coordinates: [[74.872, 31.634], [74.881, 31.64]],
  });
  assert.equal(geometry.coordinates[0]?.[0], 74.872);
  assert.equal(geometry.coordinates[0]?.[1], 31.634);
});

test('route geometry rejects fewer than two points', () => {
  assert.equal(lineStringSchema.safeParse({ type: 'LineString', coordinates: [[74.872, 31.634]] }).success, false);
});
