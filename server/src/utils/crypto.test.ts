import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashOtp, hashToken, hashTokenCandidates, matchesOtpHash } from './crypto.js';

const digest = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

test('Kaali OTP hashes verify both current and previously issued challenges', () => {
  assert.equal(matchesOtpHash('123456', hashOtp('123456')), true);
  assert.equal(matchesOtpHash('123456', digest('kavach_otp_123456')), true);
  assert.equal(matchesOtpHash('123456', digest('kavach_otp_000000')), false);
});

test('Kaali token hashes preserve validation of existing saved links', () => {
  const candidates = hashTokenCandidates('share-token');
  assert.equal(candidates[0], hashToken('share-token'));
  assert.equal(candidates[1], digest('kavach_token_share-token'));
  assert.equal(candidates.includes(digest('kavach_token_share-token')), true);
});
