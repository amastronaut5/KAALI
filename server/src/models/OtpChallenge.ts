import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IOtpChallenge extends Document {
  _id: Types.ObjectId;
  destinationHash: string;
  /** Short-lived normalized identity used to find/create the verified account. */
  destination?: string;
  channel: 'phone' | 'email';
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  consumedAt?: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

const otpChallengeSchema = new Schema<IOtpChallenge>(
  {
    destinationHash: { type: String, required: true },
    destination: { type: String, trim: true },
    channel: { type: String, enum: ['phone', 'email'], default: 'phone' },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    consumedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

otpChallengeSchema.index({ destinationHash: 1, expiresAt: -1 });
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallengeModel = mongoose.model<IOtpChallenge>('OtpChallenge', otpChallengeSchema);
