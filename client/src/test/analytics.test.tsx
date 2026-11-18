import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Analytics, Recommendations } from '@deskflow/shared';
import { employee, makeRequest, manager, mockApi, renderApp, signedInAs } from './utils';

const data = (over: Partial<Analytics['summary']> = {}): Analytics => ({
  range: { from: null, to: '2026-11-17T12:00:00.000Z' },
  summary: {
    created: 35,
    resolved: 24,
    avgResolveHours: 18.3,
    reopenRate: 0.125,
    openNow: 13,
    inProgressNow: 4,
    unassignedNow: 2,
    overdueNow: 1,
    ...over,
  },
  byStatus: [
    { status: 'OPEN', count: 6 },
    { status: 'IN_PROGRESS', count: 4 },
    { status: 'RESOLVED', count: 25 },
  ],
  byPriority: [
    { priority: 'LOW', created: 5, openNow: 1 },
    { priority: 'NORMAL', created: 20, openNow: 6 },
    { priority: 'HIGH', created: 8, openNow: 4 },
    { priority: 'URGENT', created: 2, openNow: 2 },
  ],
  stale: {
    thresholdDays: 5,
    count: 1,
    items: [
      {
        request: { id: 9, referenceNumber: 'SR-000009', title: 'Gone quiet', status: 'OPEN' },
        assignee: null,
        daysIdle: 8,
      },
    ],
  },
  byCategory: [
    {
      category: 'SOFTWARE',
      created: 10,
      unresolved: 3,
      resolved: 7,
      avgResolveHours: 11.5,
      medianResolveHours: 9,
    },
    {
      category: null,
      created: 3,
      unresolved: 3,
      resolved: 0,
      avgResolveHours: null,
      medianResolveHours: null,
    },
  ],
  mostReopened: [],
  workload: [
    {
      user: { id: 2, name: 'Dean Hasani' },
      active: 5,
      overdue: 0,
      share: 0.5,
      resolved: 10,
      held: 9,
      successRate: 0.9,
      avgResolveHours: 16.2,
      topCategories: [{ category: 'NETWORK', resolved: 6 }],
    },
    {
      user: { id: 3, name: 'Roman Max' },
      active: 2,
      overdue: 1,
      share: 0.2,
      resolved: 2,
      held: 2,
      successRate: null,
      avgResolveHours: 20,
      topCategories: [],
    },
  ],
  minSample: 3,
  trendBucket: 'week',
  trend: [
    { start: '2026-11-09T00:00:00.000Z', created: 4, resolved: 3, avgResolveHours: 20 },
    { start: '2026-11-16T00:00:00.000Z', created: 2, resolved: 5, avgResolveHours: 12 },
  ],
});

describe('manager insights', () => {
  it('shows key metrics, mix, attention list, outcomes with sample sizes, and a table view', async () => {
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /analytics': ({ url }) => ({
        body: { data: data(url.searchParams.get('range') === '7' ? { created: 7 } : {}) },
      }),
    });
    renderApp('/analytics');
    expect(await screen.findByText('35')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Manager insights' })).toBeInTheDocument();
    expect(screen.getByText('13%')).toBeInTheDocument(); // reopen rate
    expect(screen.getByText('Uncategorised')).toBeInTheDocument();
    expect(screen.getByText('Gone quiet')).toBeInTheDocument();
    expect(screen.getByText('8 days')).toBeInTheDocument();
    // A rate only with enough history; otherwise the raw count and "too few".
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('2 of 2, too few')).toBeInTheDocument();
    expect(screen.getByText(/not a ranking/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dean Hasani/ })).toHaveAttribute('href', '/team/2');

    await userEvent.click(screen.getByRole('button', { name: 'Show table' }));
    const table = screen.getByRole('columnheader', { name: 'Week of' }).closest('table')!;
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(calls.some((c) => c.url.search === '?range=7')).toBe(true);
  });

  it('is not available to employees', async () => {
    mockApi({ ...signedInAs(employee) });
    renderApp('/analytics');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('Analytics')).toBeNull();
  });
});

const recs: Recommendations = {
  category: 'HARDWARE',
  priority: 'NORMAL',
  basis: 'experience',
  teamSample: 12,
  candidates: [
    {
      user: { id: 3, name: 'Roman Max' },
      score: 78,
      confidence: 'solid',
      category: { resolved: 8, held: 7, successRate: 0.88, medianHours: 20, speedRatio: 0.7 },
      generalResolved: 15,
      workload: { active: 1, overdue: 0 },
      reasons: ['Resolved 8 Hardware requests; 7 held without being reopened'],
      cautions: [],
    },
    {
      user: { id: 2, name: 'Dean Hasani' },
      score: 40,
      confidence: 'limited',
      category: { resolved: 2, held: 2, successRate: null, medianHours: null, speedRatio: null },
      generalResolved: 20,
      workload: { active: 5, overdue: 1 },
      reasons: ['Some Hardware experience: 2 resolved, too few to judge yet'],
      cautions: ['Busy: 5 active requests'],
    },
  ],
};

describe('smart assignment', () => {
  it('suggests, explains and only assigns after the manager confirms', async () => {
    const r = makeRequest({ id: 7, assignedTo: null, category: 'HARDWARE' });
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /requests/7': { body: { data: r } },
      'GET /requests/7/recommendations': { body: { data: recs } },
      'PATCH /requests/7/assignment': {
        body: { data: { ...r, assignedTo: { id: 3, name: 'Roman Max' }, version: 4 } },
      },
    });
    renderApp('/requests/7');
    expect(await screen.findByText('Smart assignment')).toBeInTheDocument();
    expect(await screen.findByText('7 of 8 held (88%)')).toBeInTheDocument();
    expect(screen.getByText(/2 resolved, too few to judge/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Assign to Roman' }));
    // Nothing is sent until the manager confirms.
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    const dialog = await screen.findByRole('dialog', { name: 'Assign to Roman Max?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ assignedToId: 3, version: 3 });
  });

  it('is not shown to employees', async () => {
    mockApi({
      ...signedInAs(employee),
      'GET /requests/7': { body: { data: makeRequest({ id: 7, assignedTo: null }) } },
    });
    renderApp('/requests/7');
    expect(await screen.findByRole('heading', { name: /Printer/ })).toBeInTheDocument();
    expect(screen.queryByText('Smart assignment')).toBeNull();
  });
});
