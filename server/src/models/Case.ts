import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface ICaseEvidence {
  storageKey: string;
  sha256?: string;
  uploadedAt: Date;
  consentConfirmed: boolean;
}

export interface ICaseReportedUrl {
  url: string;
  domain: string;
  addedAt: Date;
}

export interface ICaseAction {
  type: string;
  status: string;
  createdAt: Date;
  details?: string;
}

export interface ICase extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  detectionId?: Types.ObjectId | null;
  status: 'draft' | 'evidence_saved' | 'notice_prepared' | 'submitted_by_user' | 'response_received' | 'closed';
  incidentType: string;
  evidence: ICaseEvidence[];
  reportedUrls: ICaseReportedUrl[];
  actions: ICaseAction[];
  notes?: string;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const caseSchema = new Schema<ICase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    detectionId: { type: Schema.Types.ObjectId, ref: 'Detection', default: null },
    status: {
      type: String,
      enum: CANONICAL_ENUMS.caseStatus,
      default: 'draft',
    },
    incidentType: { type: String, default: 'suspected_nonconsensual_image' },
    evidence: [
      {
        storageKey: { type: String, required: true },
        sha256: { type: String },
        uploadedAt: { type: Date, default: Date.now },
        consentConfirmed: { type: Boolean, required: true },
      },
    ],
    reportedUrls: [
      {
        url: { type: String, required: true },
        domain: { type: String, required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    actions: [
      {
        type: { type: String, required: true },
        status: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        details: { type: String },
      },
    ],
    notes: { type: String, default: '' },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

caseSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export const CaseModel = mongoose.model<ICase>('Case', caseSchema);
