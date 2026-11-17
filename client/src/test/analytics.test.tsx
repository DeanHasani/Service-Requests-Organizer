import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Analytics } from '@deskflow/shared';
import { employee, manager, mockApi, renderApp, signedInAs } from './utils';

const data = (over: Partial<Analytics['summary']> = {}): Analytics => ({
  range: { from: null, to: '2026-11-17T12:00:00.000Z' },
  summary: {
    created: 35,
    resolved: 24,
    avgResolveHours: 18.3,
    reopenRate: 0.125,
    openNow: 13,
    overdueNow: 1,
    ...over,
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
      resolved: 10,
      avgResolveHours: 16.2,
    },
  ],
  trend: [
    { weekStart: '2026-11-09T00:00:00.000Z', created: 4, resolved: 3, avgResolveHours: 20 },
    { weekStart: '2026-11-16T00:00:00.000Z', created: 2, resolved: 5, avgResolveHours: 12 },
  ],
});

describe('analytics', () => {
  it('shows managers the summary, categories, workload and a table view of the trend', async () => {
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /analytics': ({ url }) => ({
        body: { data: data(url.searchParams.get('range') === 'all' ? { created: 99 } : {}) },
      }),
    });
    renderApp('/analytics');
    expect(await screen.findByText('35')).toBeInTheDocument();
    expect(screen.getByText('13%')).toBeInTheDocument();
    expect(screen.getByText('Uncategorised')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dean Hasani/ })).toHaveAttribute('href', '/team/2');
    expect(screen.getByText('Nothing was reopened')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show table' }));
    const table = screen.getByRole('columnheader', { name: 'Week of' }).closest('table')!;
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(await screen.findByText('99')).toBeInTheDocument();
    expect(calls.some((c) => c.url.search === '?range=all')).toBe(true);
  });

  it('is not available to employees', async () => {
    mockApi({ ...signedInAs(employee) });
    renderApp('/analytics');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('Analytics')).toBeNull();
  });
});
