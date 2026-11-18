# Deadline & escalation intelligence

DESKFLOW watches every request that has a deadline. As a deadline gets close or passes, it marks the request, raises its working priority, tells the right people inside the app, and lists it under **Needs attention**. It runs on the server, so it works whether or not anyone has the app open.

## Deadlines and time zones

- A deadline is optional: a date and, optionally, a time. A date alone means the end of that day in the browser's time zone.
- The browser converts the chosen local date and time into an absolute instant and sends it as an ISO timestamp. The database stores it as UTC (`Request.dueAt`).
- Every comparison is between absolute instants (`dueAt` against `now`), so the result does not depend on the server's or anyone's time zone. Screens show deadlines in the viewer's local time.
- Managers set and change deadlines. Each change is recorded in the history.
- A request without a deadline is never escalated and gets no deadline reminders.

## Deadline status

Kept on the request (`Request.deadlineState`), separate from its lifecycle status (Open, In progress, Resolved):

| State         | When                                            |
| ------------- | ----------------------------------------------- |
| _(none)_      | No deadline                                     |
| `ON_TRACK`    | More than the warning window (24 hours) left    |
| `APPROACHING` | Within the warning window, not resolved         |
| `OVERDUE`     | Deadline passed, not resolved                   |
| `COMPLETED`   | Resolved (whether before or after the deadline) |

A request created with less than 24 hours left is `APPROACHING` straight away; it never waits for a threshold that has already passed.

## Escalation scenarios

| Stage                                       | Who is notified                    | What else happens                                                                                            |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **A.** Approaching, unassigned              | Managers                           | Marked approaching, working priority raised, Smart Assignment's top suggestion included, link to the request |
| **B.** Approaching, assigned but still Open | The assignee and managers          | Marked approaching, working priority raised                                                                  |
| **C.** Approaching, in progress             | The assignee and managers          | Marked approaching; the time left is in the message and on screen                                            |
| **D.** Overdue                              | The assignee (if any) and managers | Marked overdue, working priority raised further, recorded in the history, listed under Needs attention       |

Once an employee starts the request (In progress), stage B no longer applies, so they get no more "not started" reminders. They can still get the in-progress and overdue ones. Resolved requests never get new deadline notifications.

Separately, an employee is notified every time a request is assigned to them.

## Original priority and working priority

- `Request.priority` is the priority people chose. The monitor never changes it.
- `Request.escalatedPriority` is the **working priority** the monitor raises, or null. Work by `escalatedPriority ?? priority`. Lists sort by it (`priorityRank` follows it), and badges show it with an arrow, keeping the original in the tooltip and on the request page.
- Approaching raises it one step, overdue two steps, never past Urgent. A manager can set a minimum ("raise the working priority to at least High") per request. An Urgent request is never raised.
- When the deadline moves away, the request is resolved, or the deadline is removed, the working priority goes back to the original. Both the raise and the return are recorded in the history (`PRIORITY_ESCALATED`, `PRIORITY_RESTORED`).
- Managers can still change the original priority at any time. If it ends up at or above the escalation, the escalation is dropped.

## How the monitoring runs

- `server/src/deadlines/monitor.ts` → `runDeadlineMonitor(now)` runs once when the server starts (catching up after any downtime) and then every 60 seconds (`DEADLINE_CONFIG.intervalMs`). Runs never overlap.
- It also runs for one request (`evaluateRequest`) straight after that request is created, edited, assigned, started, resolved or reopened, so its state is never stale.
- Each pass loads the request, works out its state, stage and working priority with the pure rules in `deadlines/engine.ts`, then writes only what changed, in one transaction: the state, the working priority, history entries for transitions, and notifications.
- Everything it relies on lives in the database. There are no in-memory flags, so a restart simply carries on, and running it twice changes nothing the second time.
- These updates do not bump the request's `version`, so nobody's open edit is invalidated by background bookkeeping.
- Automatic history entries have no human actor (`ActivityLog.actorId` is null) and show as **DESKFLOW**.

## Notifications and de-duplication

- `Notification`: recipient, related request, type, stage, title, message, created time, read time.
- Every notification has a unique `dedupeKey`. For deadline reminders it is `deadline:{request}:{recipient}:{stage}:{cycle}`, so each person gets each stage at most once per **deadline cycle**. The database's unique constraint enforces this even if two runs overlap.
- `Request.deadlineCycle` goes up when the deadline is changed or the request is reopened. That gives reminders a fresh start for the new situation, while earlier notifications and history stay as they were.
- Notifications are only ever shown to their recipient. `GET /api/notifications` lists your own, `PATCH /api/notifications/:id` marks one read or unread (someone else's is "not found"), and `POST /api/notifications/read-all` clears your unread count.
- In the app, the bell (top of the sidebar, or the top bar on phones) shows the unread count. The list opens the related request and marks it read. Each item can also be marked read or unread on its own. It refreshes every 30 seconds.
- No email, SMS or push services are used.

## Needs attention

`GET /api/attention` lists unresolved requests that are approaching or overdue, worst first, each with its stage, time left (negative once overdue), working priority and a suggested next step. Managers see every request, with Smart Assignment's suggestion for unassigned ones. Employees see only their own requests. The dashboard shows it as **Needs attention** (managers) or **Your deadlines** (employees). It is computed live from the database on every request, so assigning, starting, resolving or moving a deadline is reflected straight away.

## Configuration

`server/src/deadlines/config.ts`:

| Setting            | Default | Meaning                                       |
| ------------------ | ------- | --------------------------------------------- |
| `warningHours`     | 24      | The "approaching" window (shared with the UI) |
| `intervalMs`       | 60 000  | How often the monitor runs                    |
| `approachingSteps` | 1       | Working priority raise while approaching      |
| `overdueSteps`     | 2       | Working priority raise once overdue           |

## Tests

`server/tests/deadlines.test.ts` drives the monitor with simulated times (`runDeadlineMonitor(now)`) instead of waiting. It covers:

- the full eleven-step workflow from the brief
- every stage and who is notified for it
- duplicate prevention, including repeated, overlapping and "after restart" runs
- requests resolved before a run, reopened requests, changed and removed deadlines
- original and working priority, and the Urgent cap
- time-zone boundaries
- the notifications and Needs attention APIs

`client/src/test/deadlines.test.tsx` covers the bell and the panels.
