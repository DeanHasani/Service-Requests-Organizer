# DESKFLOW: final implementation report

## Summary

DESKFLOW is a working full-stack service request tracker for a small internal IT support team. Staff register requests that came in by phone, email or message, give each one an owner, move it through Open, In progress and Resolved, and leave internal notes. Every change is recorded with who made it and when. All requirements in the brief are implemented. 113 automated tests pass, and lint, strict typecheck and formatting are clean.

## Completed features

| Area           | What works                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | Email and password sign-in, bcrypt hashes, server-side sessions with sliding 8-hour expiry, HTTP-only `SameSite=Strict` cookie (`Secure` in production), CSRF token, sign-in rate limit, sign-out, expired sessions sent back to sign-in with a return path |
| Roles          | Manager and Employee, enforced on the server for every endpoint; the UI hides what the user cannot do                                                                                                                                                       |
| Dashboard      | Totals by status, unassigned count, your workload, urgent and high counts, status split bar, recently updated requests, recent activity, quick create                                                                                                       |
| All requests   | Search (title, requester, contact, description, reference), filters (status, priority, source, assignee), sortable columns, server-side pagination, clear filters, row navigation, loading, error and empty states, filters kept in the URL                 |
| Create request | Validated form, fast source and priority pickers, optional assignee, double-submit protection (disabled button plus server idempotency key), success toast, opens the new request                                                                           |
| Request page   | Every field, lifecycle rail with Start work, Resolve and Reopen, edit dialog, assign, reassign and unassign (with confirmation), inline priority, resolution details, internal notes, activity history                                                      |
| My requests    | Your assigned requests with search, status and priority filters, and an empty state                                                                                                                                                                         |
| Unassigned     | Open requests with no owner, most urgent first; managers assign in one step, employees claim                                                                                                                                                                |
| Team           | Members, roles, account status, active and resolved counts with a workload bar; managers add members and deactivate or reactivate accounts                                                                                                                  |
| Data           | SQLite via Prisma with migrations, foreign keys, unique constraints, indexes, transactions, optimistic concurrency, an idempotent seed                                                                                                                      |
| Audit          | Created, edited (per field), priority changed, assigned, reassigned, unassigned, status changed, resolved and reopened events, each with actor, old value, new value and time, saved in the same transaction as the change                                  |

## Architecture

A React single-page app talks to an Express REST API on the same origin. The API owns all business rules and writes to SQLite through Prisma. A `shared` package holds the Zod schemas, enums, lifecycle transitions and permission checks, and both sides use it. Details and diagrams: [docs/architecture.md](docs/architecture.md) and [docs/database.md](docs/database.md).

## Main technical decisions

- **SQLite + Prisma 6.** Real relational storage with migrations and nothing to install. Moving to Postgres is a provider change plus a migration.
- **Own session table.** It stores only a SHA-256 of the cookie token, and deactivating a user revokes their sessions in the same transaction.
- **Optimistic concurrency.** Each write carries the `version` it read. If someone else changed the request in between, the API returns 409 and the screen reloads instead of overwriting.
- **Idempotent create.** A client-generated key makes double clicks, retries and duplicate tabs produce one request.
- **Collision-free references.** `SR-000001` numbers come from a counter row incremented inside the create transaction.
- **Atomic audit.** Every change and its activity entries are committed together.
- **Brief gaps filled deliberately.** Employees can claim unassigned work, change priority on their own requests and reopen them. Unassigning an in-progress request returns it to Open. All of these are listed in [docs/assumptions.md](docs/assumptions.md).

## Testing results

| Suite                                      | Tests   | Result         |
| ------------------------------------------ | ------- | -------------- |
| API (Supertest, isolated `test.db`)        | 78      | passed         |
| Frontend (React Testing Library)           | 26      | passed         |
| End-to-end (Playwright, isolated `e2e.db`) | 9       | passed         |
| **Total**                                  | **113** | **all passed** |

The end-to-end run covers the full ten-step journey from the brief, a permission check across employees, persistence through a new server process, and a no-sideways-scroll check of every screen on phone, iPad and desktop sizes. A clean install from an empty folder (`npm ci`, setup, tests) was also verified. Coverage details and known gaps: [docs/testing.md](docs/testing.md).

## Reviews carried out

- **Security review.** It found no critical or high issues. It found one medium issue: the dummy password hash used a lower bcrypt cost than real hashes, so login response time could reveal which emails exist. That is fixed and tested. Three low issues are also fixed and tested: the redirect guard now rejects `/\host` paths, a non-ASCII CSRF header returns 403 instead of 500, and passwords are capped at bcrypt's 72-byte limit.
- **UI review**, over two rounds of desktop (1440 px) and mobile (390 px) screenshots. The first round raised eight items, the second round marked six resolved, and the three remaining items were fixed afterwards. Those last three were checked by screenshot only. The items covered: title width in the requests table, the unassigned marker on the dashboard, tabular numerals, the mobile sign-in mark, workload bar scale and assignee label length.

## Known issues and limitations

- In production the session cookie is `Secure` only when `NODE_ENV=production`. Deploy over HTTPS with that variable set.
- The sign-in rate limit is per IP and trusts only a loopback proxy. Behind another proxy or load balancer, set Express `trust proxy` to match, or every user shares one limit.
- `npm audit` reports advisories in `deepmerge-ts`, pulled in by the Prisma CLI tooling. It is not used at request time and goes away with a future Prisma upgrade.
- The client bundle is about 670 kB before compression (one chunk). Route-level code splitting would reduce first load.
- Demo credentials are documented in the README only, not shown in the app. A real deployment should change the seeded passwords.
- Two places build the navy "New request" link by hand instead of using the shared button component; it looks the same but is duplicated styling.
- Every signed-in user can read every request and the team list. This is intentional for a shared queue, but a stricter deployment might want it narrowed.

## Unfinished functionality

None of the required functionality is unfinished. Not built, because it is outside the brief: password reset, notifications, attachments, SLA timers, request deletion, editing or deleting notes, and integrations with email, phone or chat.

## Future improvements

- Password reset and "change my password"
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

Sign in as `growing@deskflow.test` (manager) or `dean@deskflow.test` (employee). The password for every demo account is `Deskflow!2026`. The step-by-step demo is in [README.md](README.md#demo-walkthrough).
