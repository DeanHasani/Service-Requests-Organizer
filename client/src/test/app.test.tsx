import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { employee, makeRequest, manager, mockApi, page, renderApp, signedInAs } from './utils';

describe('login', () => {
  it('validates required fields before calling the server', async () => {
    const { calls } = mockApi({
      'GET /auth/me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
    });
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname === '/api/auth/login')).toBe(false);
  });

  it('shows the server message for wrong credentials', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
      'POST /auth/login': {
        status: 401,
        body: { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } },
      },
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'growing@deskflow.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
  });

  it('toggles password visibility', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
    });
    renderApp('/login');
    const input = await screen.findByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('signs in and lands on the page the user asked for', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
      'POST /auth/login': { body: { data: { user: manager, csrfToken: 't' } } },
      'GET /users': { body: { data: [] } },
    });
    renderApp('/login?next=%2Fteam');
    await userEvent.type(await screen.findByLabelText('Email'), 'growing@deskflow.test');
    await userEvent.type(screen.getByLabelText('Password'), 'Deskflow!2026');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument();
  });

  it('redirects to sign-in when the session is missing', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } },
    });
    renderApp('/requests');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('request list', () => {
  it('shows a loading state, then the rows', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockApi({
      ...signedInAs(manager),
      'GET /requests': async () => {
        await gate;
        return { body: { data: page([makeRequest()]) } };
      },
    });
    renderApp('/requests');
    expect(await screen.findByLabelText('Loading requests')).toBeInTheDocument();
    release();
    expect(await screen.findAllByText('Printer on 2nd floor offline')).not.toHaveLength(0);
    expect(screen.queryByLabelText('Loading requests')).not.toBeInTheDocument();
  });

  it('shows the first-run empty state', async () => {
    mockApi({ ...signedInAs(manager), 'GET /requests': { body: { data: page([]) } } });
    renderApp('/requests');
    expect(await screen.findByText('There are no requests yet.')).toBeInTheDocument();
    expect(screen.getByText('Create your first request to get started.')).toBeInTheDocument();
  });

  it('shows a filtered empty state with a way out', async () => {
    mockApi({ ...signedInAs(manager), 'GET /requests': { body: { data: page([]) } } });
    renderApp('/requests?status=RESOLVED');
    expect(
      await screen.findByText('No requests match your search or filters.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Clear filters/ }).length).toBeGreaterThan(0);
  });

  it('shows an error state and retries', async () => {
    let fail = true;
    mockApi({
      ...signedInAs(manager),
      'GET /requests': () =>
        fail
          ? {
              status: 500,
              body: {
                error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
              },
            }
          : { body: { data: page([makeRequest()]) } },
    });
    renderApp('/requests');
    expect(await screen.findByText('This didn’t load')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findAllByText('Printer on 2nd floor offline')).not.toHaveLength(0);
  });

  it('sends search and filters to the server', async () => {
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /requests': { body: { data: page([makeRequest()]) } },
    });
    renderApp('/requests');
    await screen.findAllByText('Printer on 2nd floor offline');
    await userEvent.type(screen.getByLabelText('Search requests'), 'printer');
    await userEvent.selectOptions(screen.getByLabelText('Filter by priority'), 'URGENT');
    await waitFor(() => {
      const last = calls.filter((c) => c.url.pathname === '/api/requests').at(-1)!;
      expect(last.url.searchParams.get('q')).toBe('printer');
      expect(last.url.searchParams.get('priority')).toBe('URGENT');
    });
  });

  it('shows the personal empty state on My requests', async () => {
    const { calls } = mockApi({
      ...signedInAs(employee),
      'GET /requests': { body: { data: page([]) } },
    });
    renderApp('/my');
    expect(
      await screen.findByText("You don't have any assigned requests at the moment."),
    ).toBeInTheDocument();
    expect(
      calls.find((c) => c.url.pathname === '/api/requests')!.url.searchParams.get('assignee'),
    ).toBe('me');
  });
});

describe('create request', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    const { calls } = mockApi({ ...signedInAs(manager) });
    renderApp('/requests/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Create request' }));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Requester name is required')).toBeInTheDocument();
    expect(screen.getByText('Description is required')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('creates a request with an idempotency key and opens it', async () => {
    const created = makeRequest({
      id: 42,
      referenceNumber: 'SR-000042',
      title: 'VPN drops',
      assignedTo: null,
    });
    const { calls } = mockApi({
      ...signedInAs(manager),
      'POST /requests': { status: 201, body: { data: created } },
      'GET /requests/42': { body: { data: created } },
    });
    renderApp('/requests/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'VPN drops');
    await userEvent.type(screen.getByLabelText('Requester name'), 'Jonas Frei');
    await userEvent.type(screen.getByLabelText('Contact information'), 'jonas@example.com');
    await userEvent.type(screen.getByLabelText('Description'), 'Drops every 30 minutes.');
    await userEvent.click(screen.getByLabelText('Email'));
    await userEvent.click(screen.getByLabelText('Urgent'));
    await userEvent.click(screen.getByRole('button', { name: 'Create request' }));

    expect(await screen.findByRole('heading', { name: 'VPN drops' })).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST' && c.url.pathname === '/api/requests')!;
    expect(post.body).toMatchObject({
      title: 'VPN drops',
      source: 'EMAIL',
      priority: 'URGENT',
      assignedToId: null,
    });
    expect((post.body as { clientRequestId: string }).clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.headers['X-CSRF-Token']).toBe('csrf-test');
  });

  it('only offers employees themselves as assignee', async () => {
    mockApi({ ...signedInAs(employee) });
    renderApp('/requests/new');
    const select = await screen.findByLabelText(/Assignee/);
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Unassigned', 'Me (Dean Hasani)']);
  });
});

describe('request details', () => {
  it('shows request information, notes empty state and history', async () => {
    mockApi({
      ...signedInAs(manager),
      'GET /requests/7': { body: { data: makeRequest() } },
      'GET /requests/7/activity': {
        body: {
          data: [
            {
              id: 1,
              request: { id: 7, referenceNumber: 'SR-000007', title: 't' },
              actor: { id: 1, name: 'Growin Manager' },
              actionType: 'CREATED',
              fieldName: null,
              oldValue: null,
              newValue: null,
              description: 'created SR-000007',
              createdAt: '2026-11-15T09:00:00.000Z',
            },
          ],
        },
      },
    });
    renderApp('/requests/7');
    expect(
      await screen.findByRole('heading', { name: 'Printer on 2nd floor offline' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Laura Bennett')).toBeInTheDocument();
    expect(screen.getByText('laura@example.com')).toBeInTheDocument();
    expect(await screen.findByText('No internal notes yet.')).toBeInTheDocument();
    expect(await screen.findByText('created SR-000007', { exact: false })).toBeInTheDocument();
  });

  it('changes status with the version it read', async () => {
    const r = makeRequest();
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /requests/7': { body: { data: r } },
      'PATCH /requests/7/status': ({ body }) => ({
        body: { data: { ...r, status: (body as { status: string }).status, version: 4 } },
      }),
    });
    renderApp('/requests/7');
    await userEvent.click(await screen.findByRole('button', { name: /Start work/ }));
    await waitFor(() => expect(screen.getAllByText('In progress').length).toBeGreaterThan(0));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toEqual({ status: 'IN_PROGRESS', version: 3 });
  });

  it('disables Start work when nobody is assigned', async () => {
    mockApi({
      ...signedInAs(manager),
      'GET /requests/7': { body: { data: makeRequest({ assignedTo: null }) } },
    });
    renderApp('/requests/7');
    expect(await screen.findByRole('button', { name: /Start work/ })).toBeDisabled();
    expect(screen.getByText('Assign someone before starting work.')).toBeInTheDocument();
  });

  it("hides work controls from an employee who doesn't own the request", async () => {
    mockApi({
      ...signedInAs(employee),
      'GET /requests/7': {
        body: { data: makeRequest({ assignedTo: { id: 9, name: 'Roman Max' } }) },
      },
    });
    renderApp('/requests/7');
    expect(
      await screen.findByText('Only Roman Max or a manager can update this request.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resolve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });

  it('rejects an empty note and adds a valid one', async () => {
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /requests/7': { body: { data: makeRequest() } },
      'POST /requests/7/notes': ({ body }) => ({
        status: 201,
        body: {
          data: {
            id: 1,
            requestId: 7,
            author: { id: 1, name: 'Growin Manager' },
            content: (body as { content: string }).content,
            createdAt: '2026-11-16T09:00:00.000Z',
            updatedAt: '2026-11-16T09:00:00.000Z',
          },
        },
      }),
    });
    renderApp('/requests/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Note is required')).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText('Add an internal note'),
      'Called the requester back.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Called the requester back.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('shows a not-found state for a missing request', async () => {
    mockApi({ ...signedInAs(manager) });
    renderApp('/requests/999');
    expect(await screen.findByText('This request doesn’t exist')).toBeInTheDocument();
  });
});
