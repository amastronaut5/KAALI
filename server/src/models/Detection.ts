import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CANONICAL_ENUMS } from '../config/constants.js';

export interface IDetection extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  requestId: string;
  resultLabel: 'manipulation_suspected' | 'no_manipulation_detected' | 'uncertain';
  score: number;
  scoreMeaning: string;
  signals: Array<{ name: string; value: string }>;
  limitations: string[];
  modelVersionId: string;
  imageSha256?: string | null;
  imageStored: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const detectionSchema = new Schema<IDetection>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestId: { type: String, required: true },
    resultLabel: {
      type: String,
      enum: CANONICAL_ENUMS.detectionResultLabel,
      required: true,
    },
    score: { type: Number, required: true },
    scoreMeaning: {
      type: String,
      default: 'model_score_not_calibrated_probability',
    },
    signals: [
      {
        name: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],
    limitations: [{ type: String }],
    modelVersionId: { type: String, required: true },
    imageSha256: { type: String, default: null },
    imageStored: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

detectionSchema.index({ userId: 1, createdAt: -1 });
detectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DetectionModel = mongoose.model<IDetection>('Detection', detectionSchema);
