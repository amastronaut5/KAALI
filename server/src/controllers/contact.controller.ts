import type { Request, Response, NextFunction } from 'express';
import { contactService } from '../services/contact.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export async function listContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const contacts = await contactService.listContacts(req.user.id);
    const data = contacts.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      phoneE164: c.phoneE164,
      email: c.email,
      relationship: c.relationship,
      channels: c.channels,
      priority: c.priority,
      status: c.status,
      createdAt: c.createdAt,
    }));
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function createContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const { contact, invitationToken } = await contactService.createContact(req.user.id, req.body);
    sendSuccess(
      res,
      {
        id: contact._id.toString(),
        status: contact.status,
        invitationExpiresAt: contact.invitation.expiresAt?.toISOString(),
        invitationToken, // Returned once so user can send invite link
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

export async function acceptContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contactId = req.params.contactId as string;
    const { invitationToken } = req.body as { invitationToken: string };
    const contact = await contactService.acceptInvitation(contactId, invitationToken);
    sendSuccess(res, {
      id: contact._id.toString(),
      status: contact.status,
      acceptedAt: contact.invitation.acceptedAt?.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const contactId = req.params.contactId as string;
    const contact = await contactService.updateContact(req.user.id, contactId, req.body);
    sendSuccess(res, {
      id: contact._id.toString(),
      name: contact.name,
      phoneE164: contact.phoneE164,
      email: contact.email,
      relationship: contact.relationship,
      channels: contact.channels,
      priority: contact.priority,
      status: contact.status,
      updatedAt: contact.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthenticated();
    const contactId = req.params.contactId as string;
    await contactService.deleteContact(req.user.id, contactId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
