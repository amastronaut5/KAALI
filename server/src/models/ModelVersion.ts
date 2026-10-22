import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IModelVersion extends Document {
  _id: Types.ObjectId;
  service: string;
  version: string;
  artifactUri: string;
  datasetVersion: string;
  evaluation: {
    testSet: string;
    metrics: {
      precision?: number | null;
      recall?: number | null;
      f1?: number | null;
      auc?: number | null;
    };
  };
  status: 'active' | 'retired';
  createdAt: Date;
  activatedAt: Date;
  retiredAt?: Date | null;
}

const modelVersionSchema = new Schema<IModelVersion>(
  {
    service: { type: String, default: 'deepfake-detection' },
    version: { type: String, required: true, unique: true },
    artifactUri: { type: String, default: 'models/detector-v1.pt' },
    datasetVersion: { type: String, default: 'dataset-v1' },
    evaluation: {
      testSet: { type: String, default: 'held-out-v1' },
      metrics: {
        precision: { type: Number, default: null },
        recall: { type: Number, default: null },
        f1: { type: Number, default: null },
        auc: { type: Number, default: null },
      },
    },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
    activatedAt: { type: Date, default: Date.now },
    retiredAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

modelVersionSchema.index({ version: 1 }, { unique: true });

export const ModelVersionModel = mongoose.model<IModelVersion>(
  'ModelVersion',
  modelVersionSchema
);
