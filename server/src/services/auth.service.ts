import { env } from '../config/env.js';
import { AuthSessionModel, OtpChallengeModel, UserModel, type IUser } from '../models/index.js';
import { generateAccessToken } from '../middleware/auth.js';
import { generateOtp, generateRandomToken, hashOtp, hashOtpCandidates, hashToken, sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { IOtpChallenge } from '../models/OtpChallenge.js';

export function normalizeOtpDestination(channel: 'phone' | 'email', destination: string): string {
  const value = destination.trim();
  if (channel === 'email') {
    const normalized = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw AppError.validation([{ field: 'destination', issue: 'Enter a valid email address.' }]);
    }
    return normalized;
  }

  const normalized = value.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw AppError.validation([{ field: 'destination', issue: 'Enter a phone number in international format, such as +14155550123.' }]);
  }
  return normalized;
}

const invalidChallengeError = () => AppError.badRequest('Invalid or expired verification challenge. Request a new code and try again.');

export interface AuthPersistence {
  findChallenge(challengeId: string): Promise<IOtpChallenge | null>;
  recordFailedAttempt(challenge: IOtpChallenge, now: Date): Promise<void>;
  consumeChallenge(challenge: IOtpChallenge, now: Date): Promise<boolean>;
  findUser(channel: 'phone' | 'email', destination: string): Promise<IUser | null>;
  createUser(data: Record<string, unknown>): Promise<IUser>;
  createSession(data: Record<string, unknown>): Promise<void>;
}

const mongoAuthPersistence: AuthPersistence = {
  findChallenge: (challengeId) => OtpChallengeModel.findById(challengeId),
  recordFailedAttempt: async (challenge, now) => {
    await OtpChallengeModel.updateOne({
      _id: challenge._id,
      consumedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: challenge.maxAttempts },
    }, { $inc: { attempts: 1 } });
  },
  consumeChallenge: async (challenge, now) => {
    const claimed = await OtpChallengeModel.findOneAndUpdate({
      _id: challenge._id,
      codeHash: challenge.codeHash,
      consumedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: challenge.maxAttempts },
    }, { $set: { consumedAt: now }, $inc: { attempts: 1 } }, { new: false });
    return Boolean(claimed);
  },
  findUser: (channel, destination) => UserModel.findOne(channel === 'phone'
    ? { phoneE164: destination }
    : { emailNormalized: destination }),
  createUser: async (data) => UserModel.create(data),
  createSession: async (data) => { await AuthSessionModel.create(data); },
};

export class AuthService {
  constructor(private readonly persistence: AuthPersistence = mongoAuthPersistence) {}
  /**
   * Request a new OTP challenge
   */
  async requestOtp(channel: 'phone' | 'email', destination: string): Promise<{ challengeId: string; expiresInSeconds: number }> {
    // This MVP has no configured production OTP delivery adapter. Never create
    // a challenge that cannot actually be delivered outside development/test.
    if (env.NODE_ENV === 'production') {
      throw AppError.intelligenceUnavailable('OTP delivery is not configured for this deployment.');
    }
    const normalizedDestination = normalizeOtpDestination(channel, destination);
    const destinationHash = sha256(normalizedDestination);

    const otpCode = generateOtp();
    const codeHash = hashOtp(otpCode);
    const expiresInSeconds = 300; // 5 minutes
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const challenge = await OtpChallengeModel.create({
      destinationHash,
      destination: normalizedDestination,
      channel,
      codeHash,
      attempts: 0,
      maxAttempts: 5,
      expiresAt,
    });

    logger.debug(`[DEV MOCK OTP] Delivery is simulated; channel=${channel}, code=${otpCode}, challengeId=${challenge._id}`);

    return {
      challengeId: challenge._id.toString(),
      expiresInSeconds,
    };
  }

  /**
   * Verify an OTP challenge and establish a session
   */
  async verifyOtp(
    challengeId: string,
    code: string
  ): Promise<{
    accessToken: string;
    expiresInSeconds: number;
    user: { id: string; displayName: string; preferredLanguage: string };
  }> {
    const challenge = await this.persistence.findChallenge(challengeId);
    const now = new Date();
    if (!challenge || !challenge.destination || challenge.consumedAt || challenge.expiresAt.getTime() <= now.getTime() || challenge.attempts >= challenge.maxAttempts) {
      throw invalidChallengeError();
    }

    const codeHashes = hashOtpCandidates(code);
    const correctCode = codeHashes.includes(challenge.codeHash);

    if (!correctCode) {
      await this.persistence.recordFailedAttempt(challenge, now);
      throw invalidChallengeError();
    }

    // Atomic consume prevents two concurrent requests from redeeming one code.
    if (!await this.persistence.consumeChallenge(challenge, now)) throw invalidChallengeError();

    let user: IUser | null = await this.persistence.findUser(challenge.channel, challenge.destination);
    if (user && user.accountStatus !== 'active') throw invalidChallengeError();

    if (!user) {
      const verifiedAt = new Date();
      const newUserData: Record<string, unknown> = {
        displayName: challenge.destination,
        preferredLanguage: 'en',
        auth: { provider: 'otp', verifiedAt },
        consent: { locationSharing: false, evidenceStorage: false, updatedAt: verifiedAt },
      };
      if (challenge.channel === 'phone') newUserData.phoneE164 = challenge.destination;
      else {
        newUserData.email = challenge.destination;
        newUserData.emailNormalized = challenge.destination;
      }
      try {
        user = await this.persistence.createUser(newUserData);
      } catch (error) {
        // Concurrent first sign-ins can race the unique email/phone index.
        const mongoCode = error && typeof error === 'object' ? (error as { code?: number }).code : undefined;
        if (mongoCode !== 11000) throw error;
        user = await this.persistence.findUser(challenge.channel, challenge.destination);
        if (!user || user.accountStatus !== 'active') throw invalidChallengeError();
      }
    }

    // Generate access token
    const accessToken = generateAccessToken({
      id: user._id.toString(),
      phoneE164: user.phoneE164,
      displayName: user.displayName,
    });

    // Create session
    const refreshToken = generateRandomToken(32);
    await this.persistence.createSession({
      userId: user._id,
      refreshTokenHash: hashToken(refreshToken),
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return {
      accessToken,
      expiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
      user: {
        id: user._id.toString(),
        displayName: user.displayName,
        preferredLanguage: user.preferredLanguage,
      },
    };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string): Promise<IUser> {
    const user = await UserModel.findOne({ _id: userId, accountStatus: { $ne: 'deleted' } });
    if (!user) {
      throw AppError.notFound('User not found');
    }
    return user;
  }

  /**
   * Update allowed user profile fields
   */
  async updateProfile(
    userId: string,
    updates: {
      displayName?: string;
      preferredLanguage?: string;
      consent?: { locationSharing?: boolean; evidenceStorage?: boolean };
    }
  ): Promise<IUser> {
    const user = await UserModel.findOne({ _id: userId, accountStatus: { $ne: 'deleted' } });
    if (!user) {
      throw AppError.notFound('User not found');
    }

    if (updates.displayName !== undefined) {
      user.displayName = updates.displayName.trim();
    }
    if (updates.preferredLanguage !== undefined) {
      user.preferredLanguage = updates.preferredLanguage.trim();
    }
    if (updates.consent) {
      if (updates.consent.locationSharing !== undefined) {
        user.consent.locationSharing = updates.consent.locationSharing;
      }
      if (updates.consent.evidenceStorage !== undefined) {
        user.consent.evidenceStorage = updates.consent.evidenceStorage;
      }
      user.consent.updatedAt = new Date();
    }

    await user.save();
    return user;
  }

  /**
   * Logout user by revoking active sessions
   */
  async logout(userId: string): Promise<void> {
    await AuthSessionModel.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
}

export const authService = new AuthService();
