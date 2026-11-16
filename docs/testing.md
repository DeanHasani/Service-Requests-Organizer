# Testing

## Approach

Tests sit at the public boundaries of the system rather than its internals:

- **API (Supertest + Vitest).** Every business rule, permission and error path goes through real HTTP calls against the real Express app and a real SQLite database. These are the most valuable tests, because the server is where the rules are enforced.
- **Frontend (React Testing Library + Vitest).** The real app (router, auth provider, query client, pages) renders in jsdom with `fetch` stubbed by a small route table. Tests interact through labels and roles the way a user would.
- **End-to-end (Playwright).** The full manager → employee → manager journey runs in Chromium against a running API and web app on their own database.

Each layer runs on an isolated database, so tests never touch `dev.db`:

| Layer     | Database                | How it is prepared                                                                                                               |
| --------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| API tests | `server/prisma/test.db` | Deleted and rebuilt with `prisma migrate deploy` before each run; every test empties the tables and creates a known set of users |
| E2E       | `server/prisma/e2e.db`  | Deleted, migrated and seeded with the demo data before each run (API on :4100, web on :5174)                                     |
| Frontend  | none                    | `fetch` is stubbed                                                                                                               |

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

Last full run: 16 November 2026, Windows 11, Node 25.8.2, Chromium (Playwright 1.65).

| Suite     | File                                         | Tests   | Result                   |
| --------- | -------------------------------------------- | ------- | ------------------------ |
| API       | `server/tests/auth.test.ts`                  | 17      | passed                   |
| API       | `server/tests/requests.test.ts`              | 32      | passed                   |
| API       | `server/tests/status.test.ts`                | 11      | passed                   |
| API       | `server/tests/notes-and-permissions.test.ts` | 18      | passed                   |
| Frontend  | `client/src/test/app.test.tsx`               | 20      | passed                   |
| Frontend  | `client/src/test/safe-next.test.ts`          | 6       | passed                   |
| E2E       | `tests/e2e/journey.spec.ts`                  | 3       | passed                   |
| **Total** |                                              | **107** | **107 passed, 0 failed** |

`npm run typecheck` and `npm run lint` report no errors. `prettier --check` is clean.

Clean-install check: the sources were copied without `node_modules`, databases or `.env` into an empty folder, then `npm ci`, `cp server/.env.example server/.env`, `npm run setup` (twice for the seed) and `npm test` were run there. That check found and fixed one real bug: the Prisma client was not generated on a fresh install, so `server` now runs `prisma generate` on `postinstall`. After the fix all steps passed.

## What is covered

**Authentication:** valid login (and the cookie flags `HttpOnly` and `SameSite=Strict`), case-insensitive email, wrong password, unknown email (same message, same bcrypt cost so timing does not reveal accounts), missing credentials, malformed JSON, deactivated account, `/me`, logout invalidates the session, unauthenticated access to every protected route, forged cookie, session expiry, missing or wrong CSRF token, non-ASCII CSRF token (403, not 500), login rate limiting, JSON 404 for unknown routes.

**Request creation:** success with `SR-000001` reference, `OPEN` status and a `CREATED` activity; default priority; client-supplied status ignored; missing fields with per-field errors; whitespace-only fields; invalid priority; invalid source; nonexistent assignee; deactivated assignee; initial assignment logged; employee can assign only themselves; unique references under 8 concurrent creates; repeated submission key returns the same request; two simultaneous duplicate submissions create one request.

**Request management:** retrieve; 404 for missing, 400 for invalid ids; edit logs one activity per changed field (unchanged fields ignored); empty edit rejected; stale edit rejected with 409 and the first edit kept; search by title, requester, description and reference; filters by status, priority, source, assignee (`me`, `none`, id); priority sorts by urgency; date sorting both ways; pagination totals; invalid query parameters rejected; assign → reassign → unassign with matching history; deactivated assignee refused; unassigning an in-progress request moves it to Open; employee claim.

**Status:** OPEN → IN_PROGRESS → RESOLVED with resolver and timestamp; OPEN → RESOLVED; RESOLVED → OPEN clears the resolution but keeps history; IN_PROGRESS without an assignee rejected; IN_PROGRESS → OPEN, RESOLVED → IN_PROGRESS and OPEN → OPEN rejected; unknown status rejected; stale status change rejected; resolved requests cannot be edited or reassigned; every change logged with actor, old and new value, and shown in the global feed.

**Notes:** created with the signed-in user as author (client-supplied author ignored), whitespace trimmed; empty or missing content rejected; nonexistent request returns 404; employees can only note their own requests.

**Authorization:** employees blocked from user management, from assigning to others, and from editing, changing status, taking or unassigning a colleague's request (and the request is unchanged afterwards); employees blocked from editing unassigned requests; employees can fully work their own requests; client-sent role fields ignored.

**Team and accounts:** workload counts, no password hashes in responses, unknown user 404, manager creates a user who can then sign in, duplicate email 409, deactivation signs the user out and releases unresolved work (in-progress goes back to Open, resolved history kept), managers cannot deactivate themselves, dashboard counts.

**Persistence:** data written through the API is read back through a fresh database connection (API test), and through a brand-new server process after the journey (E2E).

**Frontend:** sign-in validation, server error message, password visibility toggle, redirect to the requested page after sign-in, redirect to sign-in without a session; request list loading, first-run empty, filtered empty, error with retry, search and filter parameters sent to the server, personal empty state on My requests; create form validation, successful create with idempotency key and CSRF header, employee assignee options; request details, notes empty state and history; status change sends the version it read; Start work disabled without an assignee; work controls hidden from non-owners; empty note rejected and valid note added; not-found state; post-login redirect guard rejects off-site and `/\host` paths.

**End-to-end:** the ten steps from the brief (manager signs in, creates, assigns; employee signs in, finds it in My requests, adds a note, starts work, resolves; manager signs in and checks the resolution, note and the four history entries in order), a second employee cannot work on the request, and the data is still there when a new server process opens the same database.

## Known gaps

- No visual-regression or cross-browser runs; E2E uses Chromium only.
- Animation behaviour is checked by eye, not by tests.
- Frontend tests stub `fetch`, so the client/server contract is covered by the shared TypeScript types and by the E2E run rather than by contract tests.
- Load and concurrency are tested only at small scale (8 simultaneous creates, 2 simultaneous duplicate submissions).
- No automated accessibility audit (axe). Labels, roles and keyboard use are exercised indirectly because the tests query by label and role.
