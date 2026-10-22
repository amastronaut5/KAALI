import crypto from 'node:crypto';

/**
 * Generate a SHA-256 hash of a string input
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Hash an OTP with a salt or SHA-256
 */
export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(`kaali_otp_${code.trim()}`, 'utf8').digest('hex');
}

export function hashOtpCandidates(code: string): string[] {
  const normalized = code.trim();
  const legacyHash = crypto.createHash('sha256').update(`kavach_otp_${normalized}`, 'utf8').digest('hex');
  return [hashOtp(normalized), legacyHash];
}

/** Keep validating challenges issued before the Kaali hash namespace change. */
export function matchesOtpHash(code: string, storedHash: string): boolean {
  return hashOtpCandidates(code).includes(storedHash);
}

/**
 * Hash an invitation or share token
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(`kaali_token_${token.trim()}`, 'utf8').digest('hex');
}

/** Return Kaali and legacy digests so existing invitations/shares remain valid. */
export function hashTokenCandidates(token: string): string[] {
  const normalized = token.trim();
  const legacyHash = crypto.createHash('sha256').update(`kavach_token_${normalized}`, 'utf8').digest('hex');
  return [hashToken(normalized), legacyHash];
}

/**
 * Generate a high-entropy random URL-safe token (default 32 bytes = 256 bits of entropy)
 */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Generate a standard 6-digit numeric OTP
 */
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Canonical request hash for idempotency checking
 */
export function computeCanonicalRequestHash(body: unknown): string {
  const jsonString = JSON.stringify(body, Object.keys(body && typeof body === 'object' ? body : {}).sort());
  return sha256(jsonString);
}

/**
 * Redact sensitive fields from objects before logging
 */
export function redactSecrets(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactSecrets);
  }

  const SENSITIVE_KEYS = [
    'password',
    'token',
    'code',
    'otp',
    'secret',
    'authorization',
    'x-share-token',
    'invitationtoken',
    'refreshtoken',
    'accesstoken',
    'jwt_secret',
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      sanitized[key] = redactSecrets(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}
