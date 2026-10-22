import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface IRouteCandidate {
  routeId: string;
  distanceMeters: number;
  durationSeconds: number;
  riskScore: number | null;
  riskStatus: 'measured' | 'estimated' | 'unknown';
  riskConfidence: number;
  riskScale: { min: number; max: number; higherIsRiskier: boolean };
  riskLabel: string;
  riskExplanation: string[];
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [[longitude, latitude], ...]
  };
  warnings: string[];
}

export interface IRouteRequest extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  origin: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  destination: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  preferences: {
    mode: 'walking';
    priority: 'fastest' | 'balanced' | 'lower_risk';
    maxDetourRatio: number;
    departureTime?: Date;
  };
  result: {
    status: 'success' | 'error';
    routes: IRouteCandidate[];
    selectedRouteId: string;
  };
  versions: {
    optimizer: string;
    riskModel: string;
    roadGraph: string;
  };
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const routeRequestSchema = new Schema<IRouteRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    origin: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    destination: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    preferences: {
      mode: { type: String, enum: CANONICAL_ENUMS.routeMode, default: 'walking' },
      priority: { type: String, enum: CANONICAL_ENUMS.routePriority, default: 'lower_risk' },
      maxDetourRatio: { type: Number, default: 1.25 },
      departureTime: { type: Date },
    },
    result: {
      status: { type: String, default: 'success' },
      routes: [
        {
          routeId: { type: String, required: true },
          distanceMeters: { type: Number, required: true },
          durationSeconds: { type: Number, required: true },
          riskScore: { type: Number, required: true, default: null },
          riskStatus: { type: String, enum: ['measured', 'estimated', 'unknown'], default: 'unknown' },
          riskConfidence: { type: Number, min: 0, max: 1, default: 0 },
          riskScale: {
            min: { type: Number, default: 0 },
            max: { type: Number, default: 100 },
            higherIsRiskier: { type: Boolean, default: true },
          },
          riskLabel: { type: String, required: true },
          riskExplanation: [{ type: String }],
          geometry: {
            type: { type: String, enum: ['LineString'], required: true, default: 'LineString' },
            coordinates: { type: [[Number]], required: true },
          },
          warnings: [{ type: String }],
        },
      ],
      selectedRouteId: { type: String, required: true },
    },
    versions: {
      optimizer: { type: String, default: 'osrm-candidate-ranking-v1' },
      riskModel: { type: String, default: 'unknown-risk-baseline-v1' },
      roadGraph: { type: String, default: 'configured-osrm' },
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

routeRequestSchema.index({ userId: 1, createdAt: -1 });
routeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RouteRequestModel = mongoose.model<IRouteRequest>(
  'RouteRequest',
  routeRequestSchema
);
