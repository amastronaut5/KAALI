import test from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { AuthService, normalizeOtpDestination, type AuthPersistence } from './auth.service.js';
import type { IOtpChallenge } from '../models/OtpChallenge.js';
import type { IUser } from '../models/User.js';
import { hashOtp } from '../utils/crypto.js';

function challenge(overrides: Partial<IOtpChallenge> = {}): IOtpChallenge {
  return {
    _id: new Types.ObjectId(),
    destinationHash: 'identity-hash',
    destination: '+14155550123',
    channel: 'phone',
    codeHash: hashOtp('123456'),
    attempts: 0,
    maxAttempts: 5,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 300_000),
    ...overrides,
  } as IOtpChallenge;
}

function user(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(),
    displayName: 'Verified account',
    preferredLanguage: 'en',
    accountStatus: 'active',
    phoneE164: '+14155550123',
    consent: { locationSharing: false, evidenceStorage: false, updatedAt: new Date() },
    ...overrides,
  } as IUser;
}

function persistence(options: {
  challenge?: IOtpChallenge | null;
  existingUser?: IUser | null;
  createError?: unknown;
  claim?: boolean;
} = {}) {
  const calls: { attempted: number; identity: [string, string][]; created: Record<string, unknown>[]; sessions: Record<string, unknown>[] } = {
    attempted: 0, identity: [], created: [], sessions: [],
  };
  const existing = options.existingUser ?? null;
  const adapter: AuthPersistence = {
    async findChallenge() { return options.challenge === undefined ? challenge() : options.challenge; },
    async recordFailedAttempt() { calls.attempted += 1; },
    async consumeChallenge() { return options.claim ?? true; },
    async findUser(channel, destination) { calls.identity.push([channel, destination]); return existing; },
    async createUser(data) {
      calls.created.push(data);
      if (options.createError) throw options.createError;
      return user(data as Partial<IUser>);
    },
    async createSession(data) { calls.sessions.push(data); },
  };
  return { adapter, calls };
}

test('normalizes the exact phone and email identity used by OTP', () => {
  assert.equal(normalizeOtpDestination('phone', '+1 (415) 555-0123'), '+14155550123');
  assert.equal(normalizeOtpDestination('email', ' Person@Example.COM '), 'person@example.com');
  assert.throws(() => normalizeOtpDestination('phone', '555-0123'));
  assert.throws(() => normalizeOtpDestination('email', 'not-an-email'));
});

test('correct OTP authenticates only its bound phone identity', async () => {
  const bound = challenge();
  const existing = user();
  const { adapter, calls } = persistence({ challenge: bound, existingUser: existing });
  const result = await new AuthService(adapter).verifyOtp(bound._id.toString(), '123456');
  assert.equal(result.user.id, existing._id.toString());
  assert.deepEqual(calls.identity, [['phone', '+14155550123']]);
  assert.equal(calls.sessions.length, 1);
});

test('incorrect OTP increments attempts and does not look up or create a user', async () => {
  const { adapter, calls } = persistence();
  await assert.rejects(new AuthService(adapter).verifyOtp(new Types.ObjectId().toString(), '000000'), (error: Error & { statusCode?: number }) => error.statusCode === 400);
  assert.equal(calls.attempted, 1);
  assert.equal(calls.identity.length, 0);
  assert.equal(calls.created.length, 0);
});

test('expired, reused, missing, and already-attempted-out challenges are rejected', async () => {
  const missingDestination = challenge();
  delete (missingDestination as { destination?: string }).destination;
  for (const expired of [
    null,
    challenge({ expiresAt: new Date(Date.now() - 1) }),
    challenge({ consumedAt: new Date() }),
    challenge({ attempts: 5 }),
    missingDestination,
  ]) {
    const { adapter, calls } = persistence({ challenge: expired });
    await assert.rejects(new AuthService(adapter).verifyOtp(new Types.ObjectId().toString(), '123456'));
    assert.equal(calls.identity.length, 0);
  }
});

test('a race that loses the atomic challenge claim cannot create a session', async () => {
  const { adapter, calls } = persistence({ claim: false });
  await assert.rejects(new AuthService(adapter).verifyOtp(new Types.ObjectId().toString(), '123456'));
  assert.equal(calls.identity.length, 0);
  assert.equal(calls.sessions.length, 0);
});

test('unknown email identity creates a user with that verified email only', async () => {
  const bound = challenge({ channel: 'email', destination: 'person@example.com' });
  const { adapter, calls } = persistence({ challenge: bound });
  await new AuthService(adapter).verifyOtp(bound._id.toString(), '123456');
  assert.deepEqual(calls.identity, [['email', 'person@example.com']]);
  assert.equal(calls.created[0]?.email, 'person@example.com');
  assert.equal(calls.created[0]?.emailNormalized, 'person@example.com');
  assert.equal('phoneE164' in (calls.created[0] || {}), false);
});

test('duplicate phone creation race reuses only the exact matching account', async () => {
  const bound = challenge();
  let findCount = 0;
  const existing = user();
  const calls = { sessions: 0 };
  const adapter: AuthPersistence = {
    async findChallenge() { return bound; },
    async recordFailedAttempt() {},
    async consumeChallenge() { return true; },
    async findUser(channel, destination) {
      assert.equal(channel, 'phone');
      assert.equal(destination, bound.destination);
      findCount += 1;
      return findCount === 1 ? null : existing;
    },
    async createUser() { throw Object.assign(new Error('duplicate'), { code: 11000 }); },
    async createSession() { calls.sessions += 1; },
  };
  const result = await new AuthService(adapter).verifyOtp(bound._id.toString(), '123456');
  assert.equal(result.user.id, existing._id.toString());
  assert.equal(findCount, 2);
  assert.equal(calls.sessions, 1);
});

test('suspended identity cannot be authenticated', async () => {
  const bound = challenge();
  const { adapter, calls } = persistence({ challenge: bound, existingUser: user({ accountStatus: 'suspended' }) });
  await assert.rejects(new AuthService(adapter).verifyOtp(bound._id.toString(), '123456'));
  assert.equal(calls.sessions.length, 0);
});
