import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IIncidentLocation extends Document {
  _id: Types.ObjectId;
  incidentId: Types.ObjectId;
  userId: Types.ObjectId;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  accuracyMeters?: number;
  headingDegrees?: number;
  speedMetersPerSecond?: number;
  capturedAt: Date;
  expiresAt: Date;
}

const incidentLocationSchema = new Schema<IIncidentLocation>(
  {
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    location: {
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
    },
    accuracyMeters: { type: Number },
    headingDegrees: { type: Number },
    speedMetersPerSecond: { type: Number },
    capturedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

incidentLocationSchema.index({ incidentId: 1, capturedAt: -1 });
incidentLocationSchema.index({ location: '2dsphere' });
incidentLocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IncidentLocationModel = mongoose.model<IIncidentLocation>(
  'IncidentLocation',
  incidentLocationSchema
);
