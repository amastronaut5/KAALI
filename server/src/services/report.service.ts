import { ReportModel, type IReport } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { validatePilotCoordinates, type LatLng } from '../utils/geo.js';

export interface PublicReportItem {
  id: string;
  category: string;
  description: string;
  location: LatLng;
  observedAt: Date;
  corroborationCount: number;
  severity: string;
}

export class ReportService {
  /**
   * Submit a community safety report
   */
  async createReport(
    userId: string,
    data: {
      category: 'poor_lighting' | 'isolated_area' | 'blocked_road' | 'harassment_report' | 'flooding' | 'other';
      description: string;
      location: LatLng;
      observedAt?: string;
    }
  ): Promise<IReport> {
    validatePilotCoordinates(data.location.latitude, data.location.longitude);

    const observedAt = data.observedAt ? new Date(data.observedAt) : new Date();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days retention

    const report = await ReportModel.create({
      userId,
      category: data.category,
      description: data.description.trim(),
      location: {
        type: 'Point',
        coordinates: [data.location.longitude, data.location.latitude],
      },
      observedAt,
      submittedAt: new Date(),
      moderationStatus: 'pending',
      corroborationCount: 0,
      severity: 'medium',
      source: 'user_report',
      expiresAt,
    });

    return report;
  }

  /**
   * Query approved reports within a bounding box (public safe, no reporter identity)
   */
  async getReportsInBbox(bboxStr: string): Promise<PublicReportItem[]> {
    const parts = bboxStr.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length !== 4 || parts.some((p) => isNaN(p))) {
      throw AppError.badRequest('Invalid bbox parameter. Format must be minLon,minLat,maxLon,maxLat');
    }

    const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];

    const reports = await ReportModel.find({
      moderationStatus: 'approved',
      expiresAt: { $gt: new Date() },
      location: {
        $geoWithin: {
          $box: [
            [minLon, minLat],
            [maxLon, maxLat],
          ],
        },
      },
    }).limit(100);

    return reports.map((r) => ({
      id: r._id.toString(),
      category: r.category,
      description: r.description,
      location: {
        longitude: r.location.coordinates[0]!,
        latitude: r.location.coordinates[1]!,
      },
      observedAt: r.observedAt,
      corroborationCount: r.corroborationCount,
      severity: r.severity,
    }));
  }

  /**
   * Confirm/corroborate an existing report
   */
  async confirmReport(reportId: string): Promise<{ reportId: string; corroborationCount: number }> {
    const report = await ReportModel.findById(reportId);
    if (!report || report.moderationStatus !== 'approved') {
      throw AppError.notFound('Report not found or not approved');
    }

    report.corroborationCount += 1;
    // Extend expiry by 2 days upon confirmation
    report.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await report.save();

    return {
      reportId: report._id.toString(),
      corroborationCount: report.corroborationCount,
    };
  }

  /**
   * Retract a report with ownership verification
   */
  async retractReport(userId: string, reportId: string): Promise<{ reportId: string; status: string }> {
    const report = await ReportModel.findOne({ _id: reportId, userId });
    if (!report) {
      throw AppError.notFound('Report not found or you do not have permission to retract it');
    }

    report.moderationStatus = 'retracted';
    await report.save();

    return {
      reportId: report._id.toString(),
      status: 'retracted',
    };
  }
}

export const reportService = new ReportService();
