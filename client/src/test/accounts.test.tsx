import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Insights, TeamMember } from '@deskflow/shared';
import { employee, manager, mockApi, renderApp, signedInAs } from './utils';

const member = (over: Partial<TeamMember>): TeamMember => ({
  id: 9,
  name: 'Someone',
  email: null,
  role: 'EMPLOYEE',
  isActive: true,
  mustChangePassword: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  activeCount: 0,
  resolvedCount: 0,
  ...over,
});

const insights = (m: TeamMember): Insights => ({
  member: m,
  active: { open: 1, inProgress: 2, overdue: 1 },
  activeByPriority: { LOW: 0, NORMAL: 2, HIGH: 1, URGENT: 0 },
  resolved: { total: 7, last7Days: 2, last30Days: 5 },
  avgResolveHours: 30,
  created: 0,
  assignmentsLast30Days: 0,
  activeRequests: [],
  recentlyResolved: [],
  recentActivity: [],
});

describe('temporary passwords', () => {
  it('asks for a new password before showing the app', async () => {
    const { calls } = mockApi({ ...signedInAs({ ...employee, mustChangePassword: true }) });
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(calls.some((c) => c.url.pathname === '/api/dashboard')).toBe(false);
  });

  it('checks that the new password was typed the same twice', async () => {
    const { calls } = mockApi({ ...signedInAs({ ...employee, mustChangePassword: true }) });
    renderApp('/');
    await userEvent.type(await screen.findByLabelText('Temporary password'), 'abcd-efgh-jkmn');
    await userEvent.type(screen.getByLabelText('New password'), 'my-own-password');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'my-own-passw0rd');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByText('The passwords don’t match')).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname === '/api/auth/password')).toBe(false);
  });

  it('lets a manager reset a password and shows the temporary one once', async () => {
    const dean = member({ id: 2, name: 'Dean Hasani', email: 'dean@deskflow.test' });
    mockApi({
      ...signedInAs(manager),
      'GET /users/2/insights': { body: { data: insights(dean) } },
      'POST /users/2/reset-password': {
        body: { data: { user: dean, temporaryPassword: 'k7Qm-x3Rt-Pw9d' } },
      },
    });
    renderApp('/team/2');
    await userEvent.click(await screen.findByRole('button', { name: /Reset password/ }));
    const confirm = await screen.findByRole('dialog', { name: /Reset Dean Hasani’s password/ });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText('k7Qm-x3Rt-Pw9d')).toBeInTheDocument();
  });
});

describe('deleting an account', () => {
  it('is offered only once deactivated, and needs the name typed', async () => {
    const dean = member({
      id: 2,
      name: 'Dean Hasani',
      email: 'dean@deskflow.test',
      isActive: false,
    });
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /users/2/insights': { body: { data: insights(dean) } },
      'DELETE /users/2': { status: 204 },
    });
    renderApp('/team/2');
    await userEvent.click(await screen.findByRole('button', { name: /Delete account/ }));
    const dialog = await screen.findByRole('dialog', { name: /Delete Dean Hasani’s account/ });
    const submit = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(submit).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText(/Type Dean Hasani to confirm/),
      'dean hasani',
    );
    await userEvent.click(submit);
    // Back on the Team page once it is done.
    expect(await screen.findByRole('heading', { name: 'Team', level: 1 })).toBeInTheDocument();
    const sent = calls.find((c) => c.method === 'DELETE');
    expect(sent?.body).toEqual({ confirmName: 'dean hasani' });
  });

  it('is not offered for an active account', async () => {
    const dean = member({ id: 2, name: 'Dean Hasani', email: 'dean@deskflow.test' });
    mockApi({
      ...signedInAs(manager),
      'GET /users/2/insights': { body: { data: insights(dean) } },
    });
    renderApp('/team/2');
    expect(await screen.findByRole('button', { name: /Deactivate/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete account/ })).toBeNull();
  });
});

describe('roles in the app', () => {
  it('gives the review queue to managers only', async () => {
    mockApi({ ...signedInAs(employee) });
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('To review')).toBeNull();
    expect(within(nav).getByText('Requests')).toBeInTheDocument();
  });

  it('shows employees their manager apart from their coworkers', async () => {
    mockApi({
      ...signedInAs(employee),
      'GET /users': {
        body: {
          data: [
            member({ id: 1, name: 'Growin Manager', role: 'MANAGER' }),
            member({ id: 2, name: 'Dean Hasani', email: 'dean@deskflow.test' }),
            member({ id: 3, name: 'Roman Max', activeCount: 2 }),
          ],
        },
      },
    });
    renderApp('/team');
    const managerSection = (await screen.findByRole('heading', { name: 'Your manager' })).closest(
      'section',
    )!;
    expect(within(managerSection).getByText('Growin Manager')).toBeInTheDocument();
    expect(screen.getByText('Coworkers (1)')).toBeInTheDocument();
    expect(screen.getByText('Roman Max')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('shows managers only their employees, not themselves', async () => {
    mockApi({
      ...signedInAs(manager),
      'GET /users': {
        body: {
          data: [
            member({ id: 1, name: 'Growin Manager', role: 'MANAGER', email: 'g@d.test' }),
            member({ id: 2, name: 'Dean Hasani', email: 'dean@deskflow.test' }),
          ],
        },
      },
    });
    renderApp('/team');
    expect(await screen.findByText('Employees (1)')).toBeInTheDocument();
    // Their own name appears only in the sidebar, never in the list.
    expect(within(screen.getByRole('main')).queryByText('Growin Manager')).toBeNull();
    expect(screen.queryByText('Other managers')).toBeNull();
  });

  it('shows an employee their own insights on their profile', async () => {
    mockApi({
      ...signedInAs(employee),
      'GET /users/2/insights': { body: { data: insights(member({ id: 2, name: 'Dean Hasani' })) } },
    });
    renderApp('/profile');
    expect(await screen.findByText('Resolved in total')).toBeInTheDocument();
    expect(screen.getByText('1.3 days')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Change password', level: 2 })).toBeInTheDocument();
  });
});
