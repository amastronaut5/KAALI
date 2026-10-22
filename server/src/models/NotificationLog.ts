import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface INotificationLog extends Document {
  _id: Types.ObjectId;
  incidentId: Types.ObjectId;
  userId: Types.ObjectId;
  contactId?: Types.ObjectId;
  channel: 'sms' | 'whatsapp' | 'email' | 'push';
  provider: string;
  providerMessageId?: string | null;
  deliveryStatus: 'queued' | 'accepted' | 'delivered' | 'failed' | 'unknown';
  attemptCount: number;
  lastAttemptAt: Date;
  deliveredAt?: Date | null;
  errorCode?: string | null;
  createdAt: Date;
  expiresAt: Date;
}

const notificationLogSchema = new Schema<INotificationLog>(
  {
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact' },
    channel: { type: String, enum: ['sms', 'whatsapp', 'email', 'push'], required: true },
    provider: { type: String, required: true },
    providerMessageId: { type: String, default: null },
    deliveryStatus: {
      type: String,
      enum: CANONICAL_ENUMS.notificationDeliveryStatus,
      default: 'queued',
    },
    attemptCount: { type: Number, default: 1 },
    lastAttemptAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: null },
    errorCode: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationLogSchema.index({ incidentId: 1, createdAt: -1 });
notificationLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NotificationLogModel = mongoose.model<INotificationLog>(
  'NotificationLog',
  notificationLogSchema
);
