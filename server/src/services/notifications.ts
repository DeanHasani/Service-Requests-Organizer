/**
 * Persistent in-app notifications. Every notification has a unique `dedupeKey`, so the same
 * reminder for the same person, request, stage and deadline cycle is stored at most once, even if
 * the monitor runs twice or the server restarts in between.
 */
import { randomUUID } from 'node:crypto';
import type { NotificationType } from '@prisma/client';
import type { AppNotification, NotificationList } from '@deskflow/shared';
import type { AuthUser } from '../auth';
import { prisma, type Tx } from '../db';
import { notFound } from '../lib/errors';

export type NewNotification = {
  recipientId: number;
  requestId: number | null;
  type: NotificationType;
  stage?: string | null;
  title: string;
  message: string;
  dedupeKey: string;
};

/** Creates the notification unless one with the same key exists. Returns true if created. */
export async function notifyOnce(tx: Tx | typeof prisma, n: NewNotification) {
  const exists = await tx.notification.findUnique({
    where: { dedupeKey: n.dedupeKey },
    select: { id: true },
  });
  if (exists) return false;
  await tx.notification.create({ data: { ...n, stage: n.stage ?? null } });
  return true;
}

/** Tells an employee a request was just assigned to them. Each assignment is its own event. */
export async function notifyAssigned(
  request: { id: number; referenceNumber: string; title: string; dueAt: Date | null },
  assigneeId: number,
  byName: string,
) {
  const due = request.dueAt
    ? ` Due ${request.dueAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
    : '';
  await notifyOnce(prisma, {
    recipientId: assigneeId,
    requestId: request.id,
    type: 'ASSIGNED',
    title: 'Assigned to you',
    message: `${byName} assigned ${request.referenceNumber} "${request.title}" to you.${due}`,
    dedupeKey: `assigned:${request.id}:${assigneeId}:${randomUUID()}`,
  });
}

const toNotification = (n: {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
  request: { id: number; referenceNumber: string; title: string } | null;
}): AppNotification => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  request: n.request,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

/** The signed-in person's notifications, newest first, with the unread count. */
export async function listNotifications(user: AuthUser, limit = 40): Promise<NotificationList> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: user.id },
      include: { request: { select: { id: true, referenceNumber: true, title: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
  ]);
  return { items: rows.map(toNotification), unread };
}

/** Marks one of the caller's notifications read or unread. Other people's are "not found". */
export async function setRead(user: AuthUser, id: number, read: boolean) {
  const { count } = await prisma.notification.updateMany({
    where: { id, recipientId: user.id },
    data: { readAt: read ? new Date() : null },
  });
  if (!count) throw notFound('Notification');
  return listNotifications(user);
}

export async function markAllRead(user: AuthUser) {
  await prisma.notification.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return listNotifications(user);
}
