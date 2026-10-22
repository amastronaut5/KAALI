import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IPushSubscription extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceLabel?: string;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt?: Date | null;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    deviceLabel: { type: String },
    lastUsedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pushSubscriptionSchema.index({ userId: 1, revokedAt: 1 });
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

export const PushSubscriptionModel = mongoose.model<IPushSubscription>(
  'PushSubscription',
  pushSubscriptionSchema
);
