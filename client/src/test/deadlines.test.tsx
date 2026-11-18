import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AttentionItem, NotificationList } from '@deskflow/shared';
import { employee, makeRequest, manager, mockApi, renderApp, signedInAs } from './utils';

const HOUR = 3600_000;

const list: NotificationList = {
  unread: 1,
  items: [
    {
      id: 11,
      type: 'DEADLINE_UNASSIGNED',
      title: 'Due soon and unassigned',
      message: 'SR-000007 "Printer" is due in 20 hours and nobody owns it.',
      request: { id: 7, referenceNumber: 'SR-000007', title: 'Printer' },
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 10,
      type: 'ASSIGNED',
      title: 'Assigned to you',
      message: 'Older one',
      request: null,
      read: true,
      createdAt: new Date(Date.now() - 5 * HOUR).toISOString(),
    },
  ],
};

const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
  request: {
    id: 7,
    referenceNumber: 'SR-000007',
    title: 'Printer offline',
    status: 'OPEN',
    priority: 'NORMAL',
    escalatedPriority: 'HIGH',
    dueAt: new Date(Date.now() + 6 * HOUR).toISOString(),
  },
  assignee: null,
  stage: 'UNASSIGNED',
  msLeft: 6 * HOUR,
  nextAction: 'Assign someone: Roman Max is suggested',
  suggested: { id: 3, name: 'Roman Max' },
  ...over,
});

describe('notifications', () => {
  it('shows the unread count, opens the request and marks it read', async () => {
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /notifications': { body: { data: list } },
      'PATCH /notifications/11': { body: { data: { ...list, unread: 0 } } },
      'GET /requests/7': { body: { data: makeRequest({ id: 7 }) } },
    });
    renderApp('/');
    const bell = (await screen.findAllByRole('button', { name: 'Notifications, 1 unread' }))[0]!;
    await userEvent.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await userEvent.click(within(panel).getByText('Due soon and unassigned'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ read: true });
    expect(
      await screen.findByRole('heading', { name: /Printer on 2nd floor/ }),
    ).toBeInTheDocument();
  });
});

describe('needs attention', () => {
  it('shows managers what is close or late, with the next step and time left', async () => {
    mockApi({
      ...signedInAs(manager),
      'GET /attention': {
        body: {
          data: [
            item({
              stage: 'OVERDUE',
              msLeft: -2 * HOUR,
              request: {
                ...item().request,
                id: 8,
                title: 'Badge reader',
                dueAt: new Date(Date.now() - 2 * HOUR).toISOString(),
              },
              assignee: { id: 2, name: 'Dean Hasani' },
              nextAction: 'Talk to Dean: reassign or move the deadline',
              suggested: null,
            }),
            item(),
          ],
        },
      },
    });
    renderApp('/');
    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(await screen.findByText('Assign someone: Roman Max is suggested')).toBeInTheDocument();
    expect(screen.getByText('Talk to Dean: reassign or move the deadline')).toBeInTheDocument();
    expect(screen.getByText(/Overdue by 2h/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Badge reader/ })).toHaveAttribute(
      'href',
      '/requests/8',
    );
    // The working priority shows the raise, with the original kept in the tooltip.
    expect(screen.getAllByLabelText('raised for the deadline').length).toBeGreaterThan(0);
  });

  it('shows employees their own deadlines', async () => {
    mockApi({
      ...signedInAs(employee),
      'GET /attention': {
        body: {
          data: [
            item({
              stage: 'NOT_STARTED',
              assignee: { id: 2, name: 'Dean Hasani' },
              nextAction: 'Start this request',
              suggested: null,
            }),
          ],
        },
      },
    });
    renderApp('/');
    expect(await screen.findByText('Your deadlines')).toBeInTheDocument();
    expect(await screen.findByText('Start this request')).toBeInTheDocument();
    expect(screen.getByText('Due soon, not started')).toBeInTheDocument();
  });
});
