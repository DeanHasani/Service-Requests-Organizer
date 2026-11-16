import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, request, test, type Page } from '@playwright/test';

const PASSWORD = 'Deskflow!2026';
const TITLE = `Docking station not detecting monitors ${Date.now()}`;

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

let requestUrl = '';

test('manager creates and assigns, employee works and resolves, manager verifies', async ({
  page,
}) => {
  // 1–2. Manager logs in and creates a request.
  await signIn(page, 'growing@deskflow.test');
  await page.getByRole('link', { name: 'New request' }).first().click();
  await page.getByLabel('Title').fill(TITLE);
  await page.getByLabel('Requester name').fill('Marta Ruiz');
  await page.getByLabel('Contact information').fill('ext. 233');
  await page
    .getByLabel('Description')
    .fill('Dell dock on desk 9 charges the laptop but neither monitor wakes up.');
  await page.getByText('Phone', { exact: true }).click();
  await page.getByText('High', { exact: true }).click();
  await page.getByRole('button', { name: 'Create request' }).click();

  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  requestUrl = new URL(page.url()).pathname;
  await expect(page.getByText('Assign someone before starting work.')).toBeVisible();

  // 3. Manager assigns an employee.
  const assignee = page.getByLabel('Assignee');
  const dean = await assignee.locator('option', { hasText: 'Dean Hasani' }).getAttribute('value');
  await assignee.selectOption(dean!);
  await expect(page.getByText('assigned the request to Dean Hasani')).toBeVisible();
  await signOut(page);

  // 4–5. Employee logs in and finds the request in their queue.
  await signIn(page, 'dean@deskflow.test');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: /My requests/ })
    .click();
  await page.getByLabel('Search requests').fill('Docking station');
  await page.getByRole('link', { name: TITLE }).first().click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

  // 6. Employee adds an internal note.
  await page
    .getByLabel('Add an internal note')
    .fill('Firmware on the dock was outdated. Updating now.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Firmware on the dock was outdated. Updating now.')).toBeVisible();

  // 7. Employee starts work.
  await page.getByRole('button', { name: 'Start work' }).click();
  await expect(page.getByText('changed status to In progress')).toBeVisible();

  // 8. Employee resolves.
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByText('Resolved by Dean Hasani')).toBeVisible();
  await signOut(page);

  // 9–10. Manager verifies the completed request and its history.
  await signIn(page, 'growing@deskflow.test');
  await page.goto(requestUrl);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.getByText('Resolved by Dean Hasani')).toBeVisible();
  await expect(page.getByText('Firmware on the dock was outdated. Updating now.')).toBeVisible();

  const history = page.locator('section', {
    has: page.getByRole('heading', { name: 'Activity history' }),
  });
  await expect(history.getByRole('listitem')).toHaveText([
    /Growin Manager created SR-\d{6}/,
    /Growin Manager assigned the request to Dean Hasani/,
    /Dean Hasani changed status to In progress/,
    /Dean Hasani resolved the request/,
  ]);
});

test('an employee cannot work on a colleague’s request', async ({ page }) => {
  await signIn(page, 'roman@deskflow.test');
  await page.goto(requestUrl);
  await expect(
    page.getByText('Only the assignee or a manager can add notes to this request.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen' })).toHaveCount(0);
});

test('data survives a server restart', async () => {
  // Start a second, brand-new API process on the same database file and read the request back.
  const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
  const port = 4199;
  // Plain `node --import tsx` (no shell wrapper) so kill() really stops the server on every OS.
  const proc = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: 'file:./e2e.db', PORT: String(port), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  try {
    const api = await request.newContext({ baseURL: `http://localhost:${port}` });
    await expect
      .poll(async () => (await api.get('/api/health').catch(() => null))?.status(), {
        timeout: 30_000,
      })
      .toBe(200);
    expect(
      (
        await api.post('/api/auth/login', {
          data: { email: 'growing@deskflow.test', password: PASSWORD },
        })
      ).ok(),
    ).toBe(true);
    const res = await api.get(`/api${requestUrl}`);
    const body = await res.json();
    expect(body.data).toMatchObject({
      title: TITLE,
      status: 'RESOLVED',
      resolvedBy: { name: 'Dean Hasani' },
    });
    await api.dispose();
  } finally {
    proc.kill();
    await new Promise((resolve) => proc.once('exit', resolve));
  }
});
