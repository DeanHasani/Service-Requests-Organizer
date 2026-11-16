import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { employee, makeRequest, manager, mockApi, renderApp, signedInAs } from './utils';

const counts = { activeCount: 0, resolvedCount: 0 };
const team = {
  body: {
    data: [
      { ...employee, ...counts },
      { ...employee, ...counts, id: 3, name: 'Roman Max', email: 'roman@deskflow.test' },
    ],
  },
};

describe('contact field', () => {
  it('accepts only digits, spaces and a leading + for a phone number', async () => {
    mockApi({ ...signedInAs(manager) });
    renderApp('/requests/new');
    const input = await screen.findByLabelText('Contact information');
    await userEvent.type(input, '+383 44a-b218+905');
    expect(input).toHaveValue('+383 44218905');
  });

  it('stores an extension with its prefix and accepts digits only', async () => {
    mockApi({ ...signedInAs(manager) });
    renderApp('/requests/new');
    await userEvent.selectOptions(await screen.findByLabelText('Contact type'), 'extension');
    const input = screen.getByLabelText('Contact information');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await userEvent.type(input, '2x14');
    expect(input).toHaveValue('214');
  });

  it('explains what is wrong with an email when the field is left', async () => {
    mockApi({ ...signedInAs(manager) });
    renderApp('/requests/new');
    await userEvent.selectOptions(await screen.findByLabelText('Contact type'), 'email');
    const input = screen.getByLabelText('Contact information');
    expect(input).toHaveAttribute('type', 'email');
    await userEvent.type(input, 'laura@');
    await userEvent.tab();
    expect(
      await screen.findByText('Enter a valid email address, like name@company.com'),
    ).toBeInTheDocument();
  });

  it('says what each required field needs before anything is sent', async () => {
    const { calls } = mockApi({ ...signedInAs(manager) });
    renderApp('/requests/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'ab');
    await userEvent.type(screen.getByLabelText('Description'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create request' }));
    expect(await screen.findByText('Title needs at least 3 characters')).toBeInTheDocument();
    expect(screen.getByText('Description needs at least 10 characters')).toBeInTheDocument();
    expect(screen.getByText('Requester name is required')).toBeInTheDocument();
    expect(screen.getByText('Contact information is required')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('explicit save for the manager', () => {
  it('holds assignee and priority changes until Save, then sends them', async () => {
    const r = makeRequest();
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /users': team,
      'GET /requests/7': { body: { data: r } },
      'PATCH /requests/7': ({ body }) => ({
        body: { data: { ...r, ...(body as object), version: 4 } },
      }),
      'PATCH /requests/7/assignment': { body: { data: { ...r, version: 5 } } },
    });
    renderApp('/requests/7');
    await userEvent.selectOptions(await screen.findByLabelText('Priority'), 'URGENT');
    await waitFor(() =>
      expect(screen.getAllByRole('option', { name: /Roman Max/ }).length).toBe(1),
    );
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '3');

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2));
    const [priority, assignment] = calls.filter((c) => c.method === 'PATCH');
    expect(priority!.body).toEqual({ priority: 'URGENT', version: 3 });
    expect(assignment!.body).toEqual({ assignedToId: 3, version: 4 });
  });

  it('puts the saved values back on Discard', async () => {
    const { calls } = mockApi({
      ...signedInAs(manager),
      'GET /requests/7': { body: { data: makeRequest() } },
    });
    renderApp('/requests/7');
    const priority = await screen.findByLabelText('Priority');
    await userEvent.selectOptions(priority, 'LOW');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(priority).toHaveValue('HIGH');
    // the bar slides out, so wait for it to leave
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('asks before closing the edit dialog with unsaved changes', async () => {
    mockApi({ ...signedInAs(manager), 'GET /requests/7': { body: { data: makeRequest() } } });
    renderApp('/requests/7');
    await userEvent.click(await screen.findByRole('button', { name: /Edit details/ }));
    const title = screen.getByLabelText('Title');
    await userEvent.type(title, ' (finance)');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Discard your changes?' })).toBeInTheDocument();
  });

  it('does not give employees the edit or triage controls', async () => {
    mockApi({ ...signedInAs(employee), 'GET /requests/7': { body: { data: makeRequest() } } });
    renderApp('/requests/7');
    expect(await screen.findByRole('button', { name: /Start work/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit details/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Assignee')).not.toBeInTheDocument();
  });
});
