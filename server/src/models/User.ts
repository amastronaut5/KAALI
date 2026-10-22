import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  displayName: string;
  email?: string;
  emailNormalized?: string;
  phoneE164?: string;
  preferredLanguage: string;
  auth: {
    provider: string;
    verifiedAt?: Date;
  };
  consent: {
    locationSharing: boolean;
    evidenceStorage: boolean;
    updatedAt: Date;
  };
  accountStatus: 'active' | 'suspended' | 'deleted';
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    displayName: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    emailNormalized: { type: String, trim: true, lowercase: true },
    phoneE164: { type: String, trim: true },
    preferredLanguage: { type: String, default: 'en' },
    auth: {
      provider: { type: String, default: 'otp' },
      verifiedAt: { type: Date },
    },
    consent: {
      locationSharing: { type: Boolean, default: false },
      evidenceStorage: { type: Boolean, default: false },
      updatedAt: { type: Date, default: Date.now },
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
userSchema.index(
  { emailNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { emailNormalized: { $type: 'string' } },
  }
);

userSchema.index(
  { phoneE164: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneE164: { $type: 'string' } },
  }
);

export const UserModel = mongoose.model<IUser>('User', userSchema);
