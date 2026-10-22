import { ContactModel, type IContact } from '../models/index.js';
import { generateRandomToken, hashToken, hashTokenCandidates } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

export class ContactService {
  /**
   * List trusted contacts for a user
   */
  async listContacts(userId: string): Promise<IContact[]> {
    return ContactModel.find({
      userId,
      status: { $ne: 'revoked' },
    }).sort({ priority: 1, createdAt: -1 });
  }

  /**
   * Create a new contact invitation
   */
  async createContact(
    userId: string,
    data: {
      name: string;
      phoneE164: string;
      email?: string;
      relationship?: string;
      channels?: ('sms' | 'whatsapp' | 'email')[];
      priority?: number;
    }
  ): Promise<{ contact: IContact; invitationToken: string }> {
    const rawInvitationToken = generateRandomToken(32);
    const tokenHash = hashToken(rawInvitationToken);
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const contactData: Record<string, unknown> = {
      userId,
      name: data.name.trim(),
      phoneE164: data.phoneE164.trim(),
      channels: data.channels || ['sms'],
      priority: data.priority ?? 1,
      status: 'pending',
      invitation: {
        tokenHash,
        expiresAt: invitationExpiresAt,
        acceptedAt: null,
      },
    };
    if (data.email) contactData.email = data.email.trim().toLowerCase();
    if (data.relationship) contactData.relationship = data.relationship.trim();

    const contact = await ContactModel.create(contactData);

    return {
      contact,
      invitationToken: rawInvitationToken,
    };
  }

  /**
   * Accept an invitation using the high-entropy invitation token
   */
  async acceptInvitation(contactId: string, invitationToken: string): Promise<IContact> {
    const contact = await ContactModel.findById(contactId);
    if (!contact) {
      throw AppError.notFound('Contact invitation not found');
    }

    if (contact.status === 'accepted') {
      return contact; // idempotent acceptance
    }

    if (contact.status === 'revoked' || contact.status === 'declined') {
      throw AppError.badRequest('This invitation is no longer valid');
    }

    if (!contact.invitation.tokenHash || !contact.invitation.expiresAt) {
      throw AppError.badRequest('Invalid invitation record');
    }

    if (contact.invitation.expiresAt.getTime() < Date.now()) {
      throw AppError.badRequest('This invitation link has expired');
    }

    const providedHashes = hashTokenCandidates(invitationToken);
    if (!providedHashes.includes(contact.invitation.tokenHash)) {
      throw AppError.badRequest('Invalid invitation token');
    }

    contact.status = 'accepted';
    contact.invitation.acceptedAt = new Date();
    await contact.save();

    return contact;
  }

  /**
   * Update permitted contact fields with ownership check
   */
  async updateContact(
    userId: string,
    contactId: string,
    updates: {
      name?: string;
      phoneE164?: string;
      email?: string;
      relationship?: string;
      channels?: ('sms' | 'whatsapp' | 'email')[];
      priority?: number;
    }
  ): Promise<IContact> {
    const contact = await ContactModel.findOne({ _id: contactId, userId });
    if (!contact) {
      throw AppError.notFound('Contact not found or you do not have permission to edit it');
    }

    if (updates.name !== undefined) contact.name = updates.name.trim();
    if (updates.phoneE164 !== undefined) contact.phoneE164 = updates.phoneE164.trim();
    if (updates.email !== undefined) contact.email = updates.email.trim().toLowerCase();
    if (updates.relationship !== undefined) contact.relationship = updates.relationship.trim();
    if (updates.channels !== undefined) contact.channels = updates.channels;
    if (updates.priority !== undefined) contact.priority = updates.priority;

    await contact.save();
    return contact;
  }

  /**
   * Revoke/delete a contact with ownership check
   */
  async deleteContact(userId: string, contactId: string): Promise<void> {
    const contact = await ContactModel.findOne({ _id: contactId, userId });
    if (!contact) {
      throw AppError.notFound('Contact not found or you do not have permission to delete it');
    }

    contact.status = 'revoked';
    if (contact.invitation) {
      contact.invitation.tokenHash = null;
    }
    await contact.save();
  }
}

export const contactService = new ContactService();
