# Testing

## Approach

Tests go through the same entry points that users and the browser use.

- API tests (Supertest and Vitest) send real HTTP calls to the real Express app backed by a real Postgres database. Every business rule, permission and error path is covered here. Most tests live at this level because the server is what enforces the rules.
- Frontend tests (React Testing Library and Vitest) render the real app, with its router, auth provider, query client and pages, in jsdom. `fetch` is answered by a small route table, and the tests find elements by label and role the way a user would.
- End-to-end tests (Playwright) run the whole journey, from manager to employee and back to manager, in Chromium against a running API and web app with their own database.

Each layer runs on its own Postgres schema, so tests never touch dev or live data:

| Layer     | Database      | How it is prepared                                                                                                |
| --------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| API tests | schema `test` | Wiped and rebuilt from migrations before each run; every test empties the tables and creates a known set of users |
| E2E       | schema `e2e`  | Wiped, migrated and seeded with the demo data before each run (API on :4100, web on :5174)                        |
| Frontend  | none          | `fetch` is stubbed                                                                                                |

## Commands

```bash
npm test                 # API + frontend
npm test -w server       # API only
npm test -w client       # frontend only
npm run test:e2e         # Playwright (first time: npx playwright install chromium)
npm run test:all         # everything
npm run typecheck        # strict TypeScript, all workspaces
npm run lint             # ESLint
```

## Results

Last full run: 18 November 2026, Windows 11, Node 25.8.2, Chromium (Playwright 1.65).

| Suite     | File                                           | Tests   | Result                   |
| --------- | ---------------------------------------------- | ------- | ------------------------ |
| API       | `server/tests/auth.test.ts`                    | 17      | passed                   |
| API       | `server/tests/requests.test.ts`                | 47      | passed                   |
| API       | `server/tests/status.test.ts`                  | 16      | passed                   |
| API       | `server/tests/notes-and-permissions.test.ts`   | 18      | passed                   |
| API       | `server/tests/accounts-and-visibility.test.ts` | 21      | passed                   |
| API       | `server/tests/analytics.test.ts`               | 9       | passed                   |
| API       | `server/tests/recommendations.test.ts`         | 16      | passed                   |
| API       | `server/tests/deadlines.test.ts`               | 17      | passed                   |
| Frontend  | `client/src/test/app.test.tsx`                 | 23      | passed                   |
| Frontend  | `client/src/test/accounts.test.tsx`            | 9       | passed                   |
| Frontend  | `client/src/test/analytics.test.tsx`           | 4       | passed                   |
| Frontend  | `client/src/test/deadlines.test.tsx`           | 3       | passed                   |
| Frontend  | `client/src/test/errors.test.tsx`              | 11      | passed                   |
| Frontend  | `client/src/test/forms.test.tsx`               | 8       | passed                   |
| Frontend  | `client/src/test/deadline.test.ts`             | 5       | passed                   |
| Frontend  | `client/src/test/safe-next.test.ts`            | 6       | passed                   |
| E2E       | `tests/e2e/journey.spec.ts`                    | 4       | passed                   |
| E2E       | `tests/e2e/responsive.spec.ts`                 | 6       | passed                   |
| **Total** |                                                | **240** | **240 passed, 0 failed** |

`npm run typecheck` and `npm run lint` report no errors. `prettier --check` is clean.

Clean-install check: the sources were copied without `node_modules`, databases or `.env` into an empty folder, then `npm ci`, `cp server/.env.example server/.env`, `npm run setup` (twice for the seed) and `npm test` were run there. That check found one bug: the Prisma client was not generated on a fresh install, so `server` now runs `prisma generate` on `postinstall`. After the fix all steps passed.

## What is covered

### Authentication

valid login (and the cookie flags `HttpOnly` and `SameSite=Strict`), case-insensitive email, wrong password, unknown email (same message, same bcrypt cost so timing does not reveal accounts), missing credentials, malformed JSON, deactivated account, `/me`, logout invalidates the session, unauthenticated access to every protected route, forged cookie, session expiry, missing or wrong CSRF token, non-ASCII CSRF token (403, not 500), login rate limiting, JSON 404 for unknown routes.

### Request creation

success with `SR-000001` reference, `OPEN` status and a `CREATED` activity; default priority; client-supplied status ignored; missing fields with per-field errors; whitespace-only fields; invalid priority; invalid source; nonexistent assignee; deactivated assignee; initial assignment logged; employee can assign only themselves; unique references under 8 concurrent creates; repeated submission key returns the same request; two simultaneous duplicate submissions create one request.

### Request management

retrieve; 404 for missing, 400 for invalid ids; edit logs one activity per changed field (unchanged fields ignored); empty edit rejected; stale edit rejected with 409 and the first edit kept; search by title, requester, description and reference; filters by status, priority, source, assignee (`me`, `none`, id); priority sorts by urgency; date sorting both ways; pagination totals; invalid query parameters rejected; assign, then reassign, then unassign with matching history; deactivated assignee refused; a manager can never be made the assignee; unassigning an in-progress request moves it to Open; employees cannot assign, including to themselves. accounts-and-visibility.test.ts: change password (other sessions end), sign out everywhere, manager reset with forced change, last-manager guard, employee visibility (list, detail, notes, activity, feed, dashboard), team view by role, deadlines (set, move, clear, overdue filter, sort), insights.

### Status

OPEN to IN_PROGRESS to RESOLVED with resolver and timestamp; OPEN to RESOLVED; RESOLVED to OPEN clears the resolution but keeps history; IN_PROGRESS without an assignee rejected; IN_PROGRESS to OPEN, RESOLVED to IN_PROGRESS and OPEN to OPEN rejected; unknown status rejected; stale status change rejected; resolved requests cannot be edited or reassigned; every change logged with actor, old and new value, and shown in the global feed.

### Notes

created with the signed-in user as author (client-supplied author ignored), whitespace trimmed; empty or missing content rejected; nonexistent request returns 404; employees can only note their own requests.

### Authorization

employees blocked from user management, from assigning to others, and from editing, changing status, taking or unassigning a colleague's request (and the request is unchanged afterwards); employees blocked from editing unassigned requests; employees can fully work their own requests; client-sent role fields ignored.

### Team and accounts

workload counts, no password hashes in responses, unknown user 404, manager creates a user who can then sign in, duplicate email 409, deactivation signs the user out and releases unresolved work (in-progress goes back to Open, resolved history kept), managers cannot deactivate themselves, dashboard counts.

### Persistence

data written through the API is read back through a fresh database connection (API test), and through a brand-new server process after the journey (E2E).

### Deadlines, escalation and notifications

`deadlines.test.ts` uses simulated times (`runDeadlineMonitor(now)`) rather than waiting.

- **Pure rules:**
  - no deadline means no state and no escalation
  - the state boundaries (24 hours, the deadline itself, resolved)
  - short deadlines are approaching straight away
  - time-zone boundaries on absolute instants
  - stage selection, and working priority steps with the Urgent cap and the manager's minimum
- **Full workflow (the brief's eleven steps):**
  - an unassigned request due tomorrow reminds the manager, with a Smart Assignment suggestion
  - assigning it notifies the employee
  - "not started" reminders reach both the employee and the manager
  - starting it switches to the in-progress reminder only
  - overdue notifies both
  - resolving it marks it completed, restores the working priority and stops all further reminders
- **Reliability:**
  - no deadline, no reminders
  - each reminder is sent once, across repeated, overlapping and post-restart runs
  - a request resolved before the run is left alone
  - reopened requests are monitored again with their deadline and history kept
  - a changed deadline starts over, a far-away one stands down, and a removed one clears
  - the original priority stays separate and copes with manual changes
  - only the people involved are notified
- **APIs:** notifications are recipient-only with read and unread handling, and Needs attention is scoped by role with next steps.

`deadlines.test.tsx` covers the bell (unread count, opening a request, marking it read) and the manager and employee panels.

### Smart assignment

`recommendations.test.ts`: the weights add up to 1; relevant, successful experience beats raw volume elsewhere; one fix is not treated as expertise (no rate or time shown below the minimum sample); reopened fixes count against someone; speed is compared with the team on the same category and priority, not raw hours; heavy and excessive workload are penalised, and a free newcomer can beat an overloaded expert; with no history the fallback is workload then general experience; results are deterministic; the number of candidates is capped. Against the API with real history: the right person is suggested with reasons and sample sizes, deactivated people are never suggested, nothing is assigned by asking, "no history" is stated plainly, reopens lower the held count, the endpoints are manager-only and validate input, and resolved or uncategorised requests are refused with a clear reason.

### Manager insights

`analytics.test.ts`: manager-only with range validation; counts by category, reopens, workload and the trend; key numbers and status and priority mix follow the 7-day and all-time filters (daily buckets for 7 days); inactive requests are listed and a note clears them; success rates appear only with enough resolutions, in name order, without deactivated people; an empty database gives zeros and no made-up rates. `analytics.test.tsx`: the page shows the sections, sample sizes and "not a ranking" note, switches range, and is hidden from employees; the Smart assignment panel explains its suggestion and only assigns after the manager confirms, and is hidden from employees.

### Frontend

sign-in validation, server error message, password visibility toggle, redirect to the requested page after sign-in, redirect to sign-in without a session; request list loading, first-run empty, filtered empty, error with retry, search and filter parameters sent to the server, personal empty state on My requests; create form validation, successful create with idempotency key and CSRF header, employee assignee options; request details, notes empty state and history; status change sends the version it read; Start work disabled without an assignee; work controls hidden from non-owners; empty note rejected and valid note added; not-found state; post-login redirect guard rejects off-site and `/\host` paths.

### Duties and data entry

The manager cannot start or resolve work (403 with a clear message) but can reopen resolved work; the assigned employee starts, resolves and reopens; employees cannot edit details or priority. Field rules are checked on the server and in the form: minimum lengths for title, requester and description, and the contact rules for phone, email and extension, including free text like "Teams message" being rejected. In the browser, the contact picker filters what can be typed, assignee and priority changes send nothing until Save changes, Discard puts the saved values back, and closing an edited dialog asks first.

### Error pages and loading

Each kind of failure has its own screen with a specific message and a way out: page not found (with the address shown), request not found, no access (403), server error (500) with retry, server unreachable, and a crash screen if a page fails to render. When the session check fails on startup, a full-screen page offers a retry. When only one section fails, such as the notes on a request page, that section shows the error and the rest of the page keeps working. While data loads, every page shows a skeleton in the shape of its real sections, including the whole app while the session is checked. Tests cover each of these screens and the switch from skeleton to data.

### Responsive layout

every screen (sign-in, dashboard, all requests, my requests, request page, new request, unassigned, team) is loaded at 320 and 390 px phones, 768 px iPad portrait, 1024 px iPad landscape, 1280 px laptop and 1920 px desktop, and the test fails if the page scrolls sideways at any of them. Below 768 px tables become card lists; from 768 px less important table columns fold away instead of scrolling. Inputs use 16 px text on phones so iOS Safari does not zoom in.

### End-to-end

the ten steps from the brief (manager signs in, creates, assigns; employee signs in, finds it in My requests, adds a note, starts work, resolves; manager signs in and checks the resolution, note and the four history entries in order), a second employee cannot work on the request, and the data is still there when a new server process opens the same database.

## Known gaps

- No visual-regression or cross-browser runs; E2E uses Chromium only.
- Animations were checked by eye; no test covers them.
- Frontend tests stub `fetch`, so the contract between client and server is covered by the shared TypeScript types and the E2E run. There are no separate contract tests.
- Load and concurrency are tested only at small scale (8 simultaneous creates, 2 simultaneous duplicate submissions).
- No automated accessibility audit (axe). Labels, roles and keyboard use are exercised indirectly because the tests query by label and role.
