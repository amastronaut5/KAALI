import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface IIncident extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  clientRequestId: string;
  requestHash: string;
  status: 'active' | 'resolved' | 'cancelled' | 'expired';
  trigger: 'manual' | 'automatic' | 'test';
  startedAt: Date;
  resolvedAt?: Date | null;
  resolution?: 'resolved' | 'cancelled' | 'false_alarm' | null;
  currentLocation: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
    accuracyMeters?: number;
    capturedAt?: Date;
  };
  share: {
    tokenHash: string | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
  };
  locationRetentionUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const incidentSchema = new Schema<IIncident>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clientRequestId: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: {
      type: String,
      enum: CANONICAL_ENUMS.sosStatus,
      default: 'active',
    },
    trigger: {
      type: String,
      enum: ['manual', 'automatic', 'test'],
      default: 'manual',
    },
    startedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolution: {
      type: String,
      enum: [...CANONICAL_ENUMS.sosResolution, null],
      default: null,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
      accuracyMeters: { type: Number },
      capturedAt: { type: Date, default: Date.now },
    },
    share: {
      tokenHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      revokedAt: { type: Date, default: null },
    },
    locationRetentionUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
incidentSchema.index({ userId: 1, status: 1, startedAt: -1 });
incidentSchema.index({ currentLocation: '2dsphere' });
incidentSchema.index({ userId: 1, clientRequestId: 1 }, { unique: true });
incidentSchema.index(
  { 'share.tokenHash': 1 },
  { partialFilterExpression: { 'share.tokenHash': { $type: 'string' } } }
);

export const IncidentModel = mongoose.model<IIncident>('Incident', incidentSchema);
