import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface INavigationSession extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  routeRequestId: Types.ObjectId;
  selectedRouteId: string;
  previousRouteRequestIds: Types.ObjectId[];
  rerouteCount: number;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  endReason?: 'arrived' | 'stopped' | 'cancelled' | 'expired' | null;
  origin: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  destination: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  sharing: {
    enabled: boolean;
    contactIds: Types.ObjectId[];
    tokenHash: string | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
  };
  lastLocation?: {
    type: 'Point';
    coordinates: [number, number];
    accuracyMeters?: number | undefined;
    headingDegrees?: number | undefined;
    speedMetersPerSecond?: number | undefined;
    capturedAt?: Date | undefined;
  } | null | undefined;
  startedAt: Date;
  lastLocationAt?: Date | null;
  finishedAt?: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const navigationSessionSchema = new Schema<INavigationSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    routeRequestId: { type: Schema.Types.ObjectId, ref: 'RouteRequest', required: true },
    selectedRouteId: { type: String, required: true },
    previousRouteRequestIds: [{ type: Schema.Types.ObjectId, ref: 'RouteRequest' }],
    rerouteCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: CANONICAL_ENUMS.navigationStatus,
      default: 'active',
    },
    endReason: {
      type: String,
      enum: [...CANONICAL_ENUMS.navigationEndReason, null],
      default: null,
    },
    origin: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    destination: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    sharing: {
      enabled: { type: Boolean, default: false },
      contactIds: [{ type: Schema.Types.ObjectId, ref: 'Contact' }],
      tokenHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      revokedAt: { type: Date, default: null },
    },
    lastLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number] },
      accuracyMeters: { type: Number },
      headingDegrees: { type: Number },
      speedMetersPerSecond: { type: Number },
      capturedAt: { type: Date },
    },
    startedAt: { type: Date, default: Date.now },
    lastLocationAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

navigationSessionSchema.index({ userId: 1, status: 1, startedAt: -1 });
// Enforce strictly one active navigation session per user
navigationSessionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
navigationSessionSchema.index(
  { 'sharing.tokenHash': 1 },
  { partialFilterExpression: { 'sharing.tokenHash': { $type: 'string' } } }
);
navigationSessionSchema.index({ status: 1, lastLocationAt: 1 });
navigationSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NavigationSessionModel = mongoose.model<INavigationSession>(
  'NavigationSession',
  navigationSessionSchema
);
