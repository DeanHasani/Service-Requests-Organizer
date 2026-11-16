import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ErrorBoundary } from '../components/errors';
import { makeRequest, manager, mockApi, page, renderApp, signedInAs } from './utils';

const err = (status: number, code: string, message = 'x') => ({
  status,
  body: { error: { code, message } },
});

describe('error pages', () => {
  it('shows a full-screen startup error when the session check fails, and recovers on retry', async () => {
    let down = true;
    mockApi({
      'GET /auth/me': () =>
        down ? err(500, 'INTERNAL') : { body: { data: { user: manager, csrfToken: 't' } } },
    });
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'DESKFLOW couldn’t start' }),
    ).toBeInTheDocument();
    down = false;
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows a dedicated 404 page for unknown addresses, with the address', async () => {
    mockApi({ ...signedInAs(manager) });
    renderApp('/no-such-page');
    expect(
      await screen.findByRole('heading', { name: 'This page doesn’t exist' }),
    ).toBeInTheDocument();
    expect(screen.getByText('/no-such-page')).toBeInTheDocument();
    expect(screen.getByText('Error 404')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toBeInTheDocument();
  });

  it('explains a server failure on the request page as a server error, with retry', async () => {
    mockApi({ ...signedInAs(manager), 'GET /requests/7': err(500, 'INTERNAL') });
    renderApp('/requests/7');
    expect(
      await screen.findByRole('heading', { name: 'The server ran into a problem' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Error 500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });

  it('shows a no-access page for a 403', async () => {
    mockApi({ ...signedInAs(manager), 'GET /requests/7': err(403, 'FORBIDDEN') });
    renderApp('/requests/7');
    expect(
      await screen.findByRole('heading', { name: 'You don’t have access to this' }),
    ).toBeInTheDocument();
  });

  it('tells the user when the server cannot be reached inside a panel', async () => {
    mockApi({ ...signedInAs(manager) });
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/requests')) throw new TypeError('Failed to fetch');
      return original(input, init);
    }) as typeof fetch;
    renderApp('/requests');
    expect(await screen.findByText('Can’t reach the server')).toBeInTheDocument();
  });

  it('keeps the rest of the page when one section fails', async () => {
    mockApi({
      ...signedInAs(manager),
      'GET /requests/7': { body: { data: makeRequest() } },
      'GET /requests/7/notes': err(500, 'INTERNAL'),
    });
    renderApp('/requests/7');
    expect(
      await screen.findByRole('heading', { name: 'Printer on 2nd floor offline' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('The server ran into a problem')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Activity history' })).toBeInTheDocument();
  });

  it('catches a crashing page and offers a reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('boom');
    };
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'This page stopped working' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('loading skeletons', () => {
  it('shows a skeleton of the app while the session is checked', async () => {
    mockApi({ 'GET /auth/me': () => new Promise(() => {}) });
    renderApp('/');
    expect(await screen.findByLabelText('Loading DESKFLOW')).toBeInTheDocument();
  });

  it('shows a skeleton shaped like the request page while it loads', async () => {
    mockApi({ ...signedInAs(manager), 'GET /requests/7': () => new Promise(() => {}) });
    renderApp('/requests/7');
    expect(await screen.findByLabelText('Loading request')).toBeInTheDocument();
    for (const panel of ['Description', 'Internal notes', 'Activity history', 'Details']) {
      expect(screen.getByRole('heading', { name: panel })).toBeInTheDocument();
    }
  });

  it('shows skeletons for the team and unassigned lists', async () => {
    mockApi({
      ...signedInAs(manager),
      'GET /users': () => new Promise(() => {}),
      'GET /requests': () => new Promise(() => {}),
    });
    renderApp('/team');
    expect(await screen.findByLabelText('Loading team')).toBeInTheDocument();
  });

  it('replaces the skeleton with data once it arrives', async () => {
    mockApi({ ...signedInAs(manager), 'GET /requests': { body: { data: page([makeRequest()]) } } });
    renderApp('/unassigned');
    expect(await screen.findAllByText('Printer on 2nd floor offline')).not.toHaveLength(0);
    expect(screen.queryByLabelText('Loading requests')).not.toBeInTheDocument();
  });
});
