export interface NotificationPayload {
  incidentId: string;
  userId: string;
  contactId?: string | undefined;
  contactName: string;
  recipientPhoneOrEmail: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'push';
  message: string;
  shareUrl?: string | undefined;
}

export interface NotificationResult {
  channel: 'sms' | 'whatsapp' | 'email' | 'push';
  provider: string;
  providerMessageId?: string | null | undefined;
  deliveryStatus: 'queued' | 'accepted' | 'delivered' | 'failed' | 'unknown';
  errorCode?: string | null | undefined;
}

export interface INotificationProvider {
  name: string;
  send(payload: NotificationPayload): Promise<NotificationResult>;
}
