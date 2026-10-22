import test from 'node:test';
import assert from 'node:assert/strict';
import { isMongoUri, parseEnvironment } from './env.js';

const secret = 'test-secret-with-more-than-thirty-two-characters';

test('accepts local and Atlas MongoDB connection strings', () => {
  assert.equal(isMongoUri('mongodb://127.0.0.1:27017/kaali'), true);
  assert.equal(isMongoUri('mongodb+srv://user:password@cluster.example.mongodb.net/kaali?retryWrites=true'), true);
  assert.equal(isMongoUri('https://example.com/kaali'), false);
  assert.equal(isMongoUri('mongodb://'), false);
});

test('production configuration requires an explicit strong JWT secret', () => {
  assert.throws(() => parseEnvironment({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost/kaali' } as NodeJS.ProcessEnv), /Environment configuration validation failed/);
  const config = parseEnvironment({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost/kaali', JWT_SECRET: secret } as NodeJS.ProcessEnv);
  assert.equal(config.JWT_SECRET, secret);
});

test('development configuration retains the local Kaali defaults', () => {
  const config = parseEnvironment({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
  assert.equal(config.MONGODB_URI, 'mongodb://127.0.0.1:27017/kaali');
  assert.ok(config.JWT_SECRET.length >= 32);
});
