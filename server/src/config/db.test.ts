import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase } from './db.js';

test('MongoDB connection failure is actionable and does not expose URI credentials', async () => {
  const failingConnect = (async () => {
    throw new Error('failed mongodb://private-user:private-password@cluster.example/db');
  }) as unknown as typeof mongoose.connect;
  await assert.rejects(connectDatabase(failingConnect), (error: Error) => {
    assert.match(error.message, /MongoDB is unreachable/);
    assert.doesNotMatch(error.message, /private-user|private-password|cluster\.example/);
    return true;
  });
});
