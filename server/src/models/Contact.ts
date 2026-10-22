import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface IContact extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  phoneE164: string;
  email?: string;
  relationship?: string;
  channels: ('sms' | 'whatsapp' | 'email')[];
  priority: number;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  invitation: {
    tokenHash: string | null;
    expiresAt: Date | null;
    acceptedAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<IContact>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    phoneE164: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    relationship: { type: String, trim: true },
    channels: [{ type: String, enum: ['sms', 'whatsapp', 'email'], default: ['sms'] }],
    priority: { type: Number, default: 1 },
    status: {
      type: String,
      enum: CANONICAL_ENUMS.contactStatus,
      default: 'pending',
    },
    invitation: {
      tokenHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      acceptedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

contactSchema.index({ userId: 1, status: 1, priority: 1 });
contactSchema.index(
  { 'invitation.tokenHash': 1 },
  { partialFilterExpression: { 'invitation.tokenHash': { $type: 'string' } } }
);

export const ContactModel = mongoose.model<IContact>('Contact', contactSchema);
