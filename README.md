# DESKFLOW

An internal service request tracker for a small IT support team. Requests arrive by phone, email and chat; staff log them in DESKFLOW, give each one an owner, move it from Open to In progress to Resolved, and leave internal notes along the way. Every change goes into an activity history with a name and a time.

## The problem

Requests used to live in personal notes and spreadsheets. Some were forgotten, some were handled twice, and nobody could tell who owned a request or whether it was done. DESKFLOW gives the team one queue with one owner per request and a full audit trail.

## Features

- Sign-in with server-side sessions (no public sign-up; demo accounts are seeded)
- Two roles with separate duties. Managers review, prioritise, set deadlines, assign and track work (they can reopen resolved work). Employees report requests and start, note and resolve the ones assigned to them. Employees see their own work, what they reported, and everything resolved.
- Dashboard with live counts, status split, your workload, recent requests and recent activity
- Request list with search, filters, sortable columns and server-side pagination
- Create requests with field checks (minimum lengths, a contact field with a phone, email or extension picker) and duplicate-submission protection
- Request page: edit details, assign and change priority with an explicit Save, start, resolve, reopen
- Internal notes and an automatic, attributed activity history
- My requests, a To review queue for managers (priority, deadline and owner in one step) and a Team page that shows employees who their manager is
- Categories on every request (Hardware, Software, Network, Access & accounts, Facilities, Other), chosen when reporting and correctable by managers
- Analytics for managers: requests and resolution time by category, weekly logged vs resolved and speed trend, most reopened requests, workload per employee
- Deadlines with overdue highlighting, an overdue filter and deadline sorting
- Profile with personal insights (active work, resolved per week and month, average time to resolve, recent activity); managers open any employee's
- Managers add team members, deactivate or reactivate accounts and reset passwords with a one-time temporary password; everyone can change their password and sign out everywhere
- Concurrent edits are caught: if someone saved a request after you opened it, your change is refused and the page loads the latest version
- Clear error pages for each kind of failure, and loading skeletons shaped like each page
   (iPad portrait and landscape) and desktops; tables turn into cards on small screens

## Tech stack

| Layer    | Choice                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router 7, TanStack Query, React Hook Form, Zod, Motion, Lucide, Sonner |
| Backend  | Node.js, Express 5, TypeScript (run with `tsx`), Zod                                                                     |
| Database | SQLite with Prisma 6 and Prisma Migrate                                                                                  |
| Auth     | Server-side sessions in the database, bcrypt, HTTP-only cookies, CSRF token, rate-limited login                          |
| Tests    | Vitest, Supertest, React Testing Library, Playwright                                                                     |
| Tooling  | npm workspaces, strict TypeScript, ESLint, Prettier                                                                      |

Architecture and decisions: [docs/architecture.md](docs/architecture.md). Data model: [docs/database.md](docs/database.md). Assumptions: [docs/assumptions.md](docs/assumptions.md). Tests and results: [docs/testing.md](docs/testing.md).

## Requirements

- Node.js 20.19 or newer (developed on Node 25)
- npm 10 or newer

Nothing else: SQLite is a file, so there is no database server to install.

## Setup

```bash
git clone https://github.com/DeanHasani/Service-Requests-Organizer.git
cd Service-Requests-Organizer

npm install                              # installs all three workspaces
cp server/.env.example server/.env       # Windows: copy server\.env.example server\.env
npm run setup                            # applies migrations, then seeds demo data
npm run dev                              # API on :4000, web app on :5173
```

Open http://localhost:5173 and sign in with a demo account.

### Environment variables (`server/.env`)

| Variable            | Default         | Purpose                                          |
| ------------------- | --------------- | ------------------------------------------------ |
| `DATABASE_URL`      | `file:./dev.db` | SQLite file, relative to `server/prisma/`        |
| `PORT`              | `4000`          | API port                                         |
| `NODE_ENV`          | `development`   | `production` turns on `Secure` cookies           |
| `SESSION_TTL_HOURS` | `8`             | Session lifetime; it slides forward while in use |
| `LOGIN_RATE_LIMIT`  | `10`            | Failed sign-ins allowed per IP per 15 minutes    |
| `SEED_PASSWORD`     | `Deskflow!2026` | Password the seed gives every demo account       |

## Database commands

| Command                            | What it does                                                          |
| ---------------------------------- | --------------------------------------------------------------------- |
| `npm run db:migrate`               | Applies pending migrations (`prisma migrate deploy`). Safe to rerun.  |
| `npm run db:seed`                  | Adds demo users and requests. Idempotent: rerunning adds nothing new. |
| `npm run setup`                    | Both of the above.                                                    |
| `npm run db:migrate:dev -w server` | Creates a new migration after a schema change (development only).     |
| `npm run db:reset`                 | Deletes all data in `dev.db`, reapplies migrations and reseeds.       |

## Demo accounts

All four use the password `Deskflow!2026`, which comes from `SEED_PASSWORD`.

| Name           | Email                 | Role     |
| -------------- | --------------------- | -------- |
| Growin Manager | growin@deskflow.test  | Manager  |
| Dean Hasani    | dean@deskflow.test    | Employee |
| Roman Max      | roman@deskflow.test   | Employee |
| Roxanne Keys   | roxanne@deskflow.test | Employee |

The seed adds 18 requests covering every status, priority and source, assigned and unassigned, with notes and history.

## Demo walkthrough

1. Sign in as Growin Manager (`growin@deskflow.test`). Click **New request**, fill it in, create it.
2. On the request page, pick Dean Hasani in the Assignee field and press **Save changes**.
3. Sign out (bottom of the sidebar). Sign in as Dean (`dean@deskflow.test`).
4. Open **My requests**, find the request, add a note, click **Start work**, then **Resolve**. (Only the assigned employee has these buttons.)
5. Sign in as the manager again and open the request. It shows who resolved it and when, the note, and the full activity history.
6. Stop the servers and run `npm run dev` again. Everything is still there.

### Account recovery

A manager resets a forgotten password from **Team**, then the person's page, then **Reset password**. If no manager can sign in, run this on the server:

```bash
npm run user:reset-password -- growin@deskflow.test
```

It prints a one-time password; the person chooses their own when they sign in.

## Scripts

| Command             | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | API and web app with hot reload                                                  |
| `npm test`          | Server (Supertest) and client (React Testing Library) tests                      |
| `npm run test:e2e`  | Playwright end-to-end journey on its own database                                |
| `npm run test:all`  | All of the above                                                                 |
| `npm run typecheck` | Strict TypeScript across all workspaces                                          |
| `npm run lint`      | ESLint                                                                           |
| `npm run format`    | Prettier                                                                         |
| `npm run build`     | Production build of the web app                                                  |
| `npm start`         | API in production mode; it also serves the built web app if `client/dist` exists |

The first `npm run test:e2e` needs a browser: `npx playwright install chromium`.

### Running in production mode

```bash
npm run build
NODE_ENV=production npm start      # serves app + API on :4000
```

In production the session cookie is `Secure`, so serve it over HTTPS (or `localhost`).

## Project layout

```
client/   React app (pages, components, data hooks)
server/   Express API, Prisma schema, migrations, seed, API tests
shared/   Zod schemas, enums, lifecycle and permission rules, DTO types
tests/    Playwright end-to-end tests
docs/     Architecture, database, assumptions, testing
```

See also [PROJECT_PLAN.md](PROJECT_PLAN.md) and [FINAL_IMPLEMENTATION_REPORT.md](FINAL_IMPLEMENTATION_REPORT.md).
