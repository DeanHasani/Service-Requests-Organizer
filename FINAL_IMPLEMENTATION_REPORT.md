# DESKFLOW: final implementation report

## Summary

DESKFLOW is a full-stack service request tracker for a small internal IT support team. Staff register requests that came in by phone, email or message, give each one an owner, move it through Open, In progress and Resolved, and leave internal notes. Every change is recorded with who made it and when. All requirements in the brief are implemented. 155 automated tests pass, and lint, strict typecheck and formatting are clean.

## Completed features

| Area                                                                                                                                    | What works                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication                                                                                                                          | Email and password sign-in, bcrypt hashes, server-side sessions with sliding 8-hour expiry, HTTP-only `SameSite=Strict` cookie (`Secure` in production), CSRF token, sign-in rate limit, sign-out, expired sessions sent back to sign-in with a return path |
| Roles                                                                                                                                   | Manager and Employee, enforced on the server for every endpoint; the UI hides what the user cannot do                                                                                                                                                       |
| Dashboard                                                                                                                               | Totals by status, unassigned count, your workload, urgent and high counts, status split bar, recently updated requests, recent activity, quick create                                                                                                       |
| All requests                                                                                                                            | Search (title, requester, contact, description, reference), filters (status, priority, source, assignee), sortable columns, server-side pagination, clear filters, row navigation, loading, error and empty states, filters kept in the URL                 |
| Create request                                                                                                                          | Fields checked when you leave them (minimum lengths, contact with a phone, email or extension picker that filters what can be typed), double-submit protection (disabled button plus server idempotency key), success toast, opens the new request          |
| Request page                                                                                                                            | Every field, lifecycle rail with Start work, Resolve and Reopen, edit dialog, assign, reassign and unassign (with confirmation), inline priority, resolution details, internal notes, activity history                                                      |
| My requests                                                                                                                             | Your assigned requests with search, status and priority filters, and an empty state                                                                                                                                                                         |
| To review                                                                                                                               | Open requests with no owner, most urgent first; managers set priority, deadline and owner in one step                                                                                                                                                       |
| Team                                                                                                                                    | Members, roles, account status, active and resolved counts with a workload bar; managers add members and deactivate or reactivate accounts                                                                                                                  |
| Errors and loading                                                                                                                      | Separate pages for page not found, request not found, no access, server error, server unreachable and crashes; errors inside one panel stay in that panel; skeletons shaped like each page while data loads                                                 |
|  SQLite via Prisma with migrations, foreign keys, unique constraints, indexes, transactions, optimistic concurrency, an idempotent seed |
| Audit                                                                                                                                   | Created, edited (per field), priority changed, assigned, reassigned, unassigned, status changed, resolved and reopened events, each with actor, old value, new value and time, saved in the same transaction as the change                                  |

## Architecture

A React single-page app talks to an Express REST API on the same origin. The API owns all business rules and writes to SQLite through Prisma. A `shared` package holds the Zod schemas, enums, lifecycle transitions and permission checks, and both sides use it. Details and diagrams: [docs/architecture.md](docs/architecture.md) and [docs/database.md](docs/database.md).

## Main technical decisions

- SQLite with Prisma 6 gives real relational storage and migrations with nothing extra to install. Moving to Postgres means changing the provider and running a migration.
- Sessions live in their own table, which stores only a SHA-256 of the cookie token. Deactivating a user deletes their sessions in the same transaction.
- Each write sends the `version` it read. If someone else changed the request in between, the API answers 409 and the screen reloads with the latest data.
- The create form sends a key generated in the browser, so a double click, a retry or a second open tab still produces one request.
- `SR-000001` style numbers come from a counter row that is incremented inside the create transaction, so two requests can never get the same number.
- Every change is saved in the same transaction as its activity entries.
- Where the brief left room, duties are split cleanly. The manager creates, edits, assigns and tracks; they can reopen resolved work but never start or resolve it and are never an assignee. The assigned employee starts, notes and resolves the work and can reopen it. Unassigning a request that is in progress moves it back to Open. [docs/assumptions.md](docs/assumptions.md) lists each of these.

## Testing results

| Suite                                      | Tests   | Result         |
| ------------------------------------------ | ------- | -------------- |
| API (Supertest, isolated `test.db`)        | 97      | passed         |
| Frontend (React Testing Library)           | 48      | passed         |
| End-to-end (Playwright, isolated `e2e.db`) | 10      | passed         |
| **Total**                                  | **155** | **all passed** |

The end-to-end run covers the full ten-step journey from the brief, a permission check across employees, persistence through a new server process, and a no-sideways-scroll check of every screen on phone, iPad and desktop sizes. A clean install from an empty folder (`npm ci`, setup, tests) was also verified. Coverage details and known gaps: [docs/testing.md](docs/testing.md).

## Reviews carried out

The security review found no critical or high issues. The one medium issue was that the dummy password hash used a lower bcrypt cost than real hashes, so login response time could reveal which emails have accounts. That is fixed and has a test. Three low issues are fixed and tested as well: the redirect guard rejects `/\host` paths, a non-ASCII CSRF header gets a 403 instead of a 500, and passwords are capped at bcrypt's 72-byte limit.

The UI review went through two rounds of desktop (1440 px) and mobile (390 px) screenshots. The first round raised eight items and the second marked six of them resolved. The last three were fixed afterwards and checked by screenshot. They covered title width in the requests table, the unassigned marker on the dashboard, tabular numerals, the logo on the mobile sign-in page, the workload bar scale and the length of assignee labels.

## Known issues and limitations

- In production the session cookie is `Secure` only when `NODE_ENV=production`. Deploy over HTTPS with that variable set.
- The sign-in rate limit is per IP and trusts only a loopback proxy. Behind another proxy or load balancer, set Express `trust proxy` to match, or every user shares one limit.
- `npm audit` reports advisories in `deepmerge-ts`, pulled in by the Prisma CLI tooling. It is not used at request time and goes away with a future Prisma upgrade.
- The client bundle is about 670 kB before compression (one chunk). Route-level code splitting would reduce first load.
- Demo credentials are documented in the README only, not shown in the app. A real deployment should change the seeded passwords.
- Two places build the navy "New request" link by hand instead of using the shared button component; it looks the same but is duplicated styling.
- Employees see their own and reported requests plus all resolved ones; the team list shows them names and workload only. Dashboard totals for employees are counted over what they can see.

## Unfinished functionality

Everything the brief requires is built. These were left out because the brief does not ask for them: self-service password reset by email (managers reset passwords instead), notifications, attachments, SLA timers, request deletion, editing or deleting notes, and integrations with email, phone or chat.

## Future improvements

- Email or in-app notifications when a request is assigned to you
- SLA targets per priority, with overdue highlighting
- Saved filters and a keyboard command palette
- Attachments (screenshots, logs)
- Postgres and a container image for multi-instance deployment
- Route-level code splitting and an axe accessibility check in CI

## How to run and demonstrate

```bash
npm install
cp server/.env.example server/.env
npm run setup        # migrate + seed
npm run dev          # http://localhost:5173
```

Sign in as `growin@deskflow.test` (manager) or `dean@deskflow.test` (employee). The password for every demo account is `Deskflow!2026`. The step-by-step demo is in [README.md](README.md#demo-walkthrough).
