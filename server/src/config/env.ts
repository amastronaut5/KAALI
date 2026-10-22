import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

dotenv.config();

const developmentJwtSecret = randomBytes(48).toString('base64url');

export function isMongoUri(value: string): boolean {
  if (!/^mongodb(?:\+srv)?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.hostname) && (parsed.protocol === 'mongodb:' || parsed.protocol === 'mongodb+srv:');
  } catch {
    return false;
  }
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_DOMAIN: z.string().default('localhost:5173'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1).refine(isMongoUri, 'Use a valid mongodb:// or mongodb+srv:// URI').default('mongodb://127.0.0.1:27017/kaali'),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),

  PYTHON_ROUTING_URL: z.string().url().default('http://localhost:8000'),
  PYTHON_DETECTION_URL: z.string().url().default('http://localhost:8000'),
  PYTHON_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),

  PILOT_BBOX_MIN_LAT: z.coerce.number().default(40.49),
  PILOT_BBOX_MAX_LAT: z.coerce.number().default(40.92),
  PILOT_BBOX_MIN_LON: z.coerce.number().default(-74.26),
  PILOT_BBOX_MAX_LON: z.coerce.number().default(-73.70),

  SMS_PROVIDER: z.string().default('mock'),
  WHATSAPP_PROVIDER: z.string().default('mock'),
});

export function parseEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = source.NODE_ENV ?? 'development';
  const input = {
    ...source,
    JWT_SECRET: source.JWT_SECRET ?? (nodeEnv === 'production' ? undefined : developmentJwtSecret),
  };
  const result = envSchema.safeParse(input);
  if (!result.success) {
    // Zod's formatted issues contain paths and requirements, never raw env values.
    console.error('Invalid Kaali server environment:', result.error.issues.map(({ path, message }) => ({ variable: path.join('.'), message })));
    throw new Error('Environment configuration validation failed. Review server/.env.example.');
  }
  if (result.data.PILOT_BBOX_MIN_LAT >= result.data.PILOT_BBOX_MAX_LAT || result.data.PILOT_BBOX_MIN_LON >= result.data.PILOT_BBOX_MAX_LON) {
    throw new Error('Environment configuration validation failed: pilot bounding-box minimums must be less than maximums.');
  }
  return result.data;
}

export const env = parseEnvironment();
