import { NotificationLogModel } from '../../models/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type {
  INotificationProvider,
  NotificationPayload,
  NotificationResult,
} from './notification.interface.js';

class MockNotificationProvider implements INotificationProvider {
  public readonly name = 'development-mock';

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    logger.info(`[MOCK NOTIFICATION] Simulated ${payload.channel} notification; no message was sent.`);
    return {
      channel: payload.channel,
      provider: this.name,
      deliveryStatus: 'unknown',
    };
  }
}

export class NotificationService {
  private providers: Map<string, INotificationProvider> = new Map();

  constructor() {
    if (env.NODE_ENV !== 'production') {
      const mockProvider = new MockNotificationProvider();
      for (const channel of ['sms', 'whatsapp', 'email', 'push']) this.providers.set(channel, mockProvider);
    }
  }

  /**
   * Dispatch a notification to a contact and log the attempt in database
   */
  async dispatch(payload: NotificationPayload): Promise<NotificationResult> {
    const provider = this.providers.get(payload.channel);

    if (!provider) {
      const result: NotificationResult = { channel: payload.channel, provider: 'not-configured', deliveryStatus: 'failed', errorCode: 'PROVIDER_NOT_CONFIGURED' };
      await this.persistAttempt(payload, result);
      return result;
    }

    let result: NotificationResult;
    try {
      result = await provider.send(payload);
    } catch (err) {
      logger.error(`Notification provider failure for ${payload.channel}`, { errorName: err instanceof Error ? err.name : 'unknown' });
      result = {
        channel: payload.channel,
        provider: provider.name,
        deliveryStatus: 'failed',
        errorCode: err instanceof Error ? err.message : 'PROVIDER_ERROR',
      };
    }

    await this.persistAttempt(payload, result);
    return result;
  }

  private async persistAttempt(payload: NotificationPayload, result: NotificationResult): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days retention
      const logData: Record<string, unknown> = {
        incidentId: payload.incidentId,
        userId: payload.userId,
        channel: payload.channel,
        provider: result.provider,
        providerMessageId: result.providerMessageId || null,
        deliveryStatus: result.deliveryStatus,
        attemptCount: 1,
        lastAttemptAt: new Date(),
        errorCode: result.errorCode || null,
        expiresAt,
      };
      if (payload.contactId) {
        logData.contactId = payload.contactId;
      }
      await NotificationLogModel.create(logData);
    } catch (dbErr) {
      logger.error('Failed to write notification log to database', { errorName: dbErr instanceof Error ? dbErr.name : 'unknown' });
    }
  }
}

export const notificationService = new NotificationService();
