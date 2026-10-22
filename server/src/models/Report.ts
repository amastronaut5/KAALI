import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface IReport extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  category: 'poor_lighting' | 'isolated_area' | 'blocked_road' | 'harassment_report' | 'flooding' | 'other';
  description: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  observedAt: Date;
  submittedAt: Date;
  moderationStatus: 'pending' | 'approved' | 'rejected' | 'retracted';
  corroborationCount: number;
  severity: 'low' | 'medium' | 'high';
  source: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
      type: String,
      enum: CANONICAL_ENUMS.reportCategory,
      required: true,
    },
    description: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    observedAt: { type: Date, required: true },
    submittedAt: { type: Date, default: Date.now },
    moderationStatus: {
      type: String,
      enum: CANONICAL_ENUMS.reportModerationStatus,
      default: 'pending',
    },
    corroborationCount: { type: Number, default: 0 },
    severity: {
      type: String,
      enum: CANONICAL_ENUMS.reportSeverity,
      default: 'medium',
    },
    source: { type: String, default: 'user_report' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

reportSchema.index({ location: '2dsphere' });
reportSchema.index({ moderationStatus: 1, submittedAt: -1 });
reportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ReportModel = mongoose.model<IReport>('Report', reportSchema);
