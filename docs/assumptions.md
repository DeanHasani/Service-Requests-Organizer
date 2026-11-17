# Assumptions

## Business

- Requests come in by phone, email or message. A staff member types them in. There is no integration with any of those channels.
- The requester is not a user. They never log in and are never notified.
- One request has at most one assignee at a time. Pairing up is handled through notes.
- Managers see every request. Employees see the requests assigned to them, the ones they reported, and every resolved request (read-only, as a record of how things were fixed). Anything else is reported as not found, so request ids reveal nothing.
- Notes are internal only.

## Roles

| Action                                                                  | Manager     | Employee                               |
| ----------------------------------------------------------------------- | ----------- | -------------------------------------- |
| View requests, details, notes, activity                                 | All         | Own, reported, and all resolved        |
| Create a request                                                        | Yes         | Yes (starts Open, Unassigned, Normal)  |
| Edit details (title, description, requester, contact, source, priority) | Any request | No                                     |
| Set or change a deadline                                                | Any request | No                                     |
| Start work, resolve                                                     | No          | Only requests assigned to them         |
| Reopen a resolved request                                               | Any request | Only requests assigned to them         |
| Add a note                                                              | Any request | Only requests assigned to them         |
| Assign, reassign, unassign (to employees only)                          | Any request | No                                     |
| Be the assignee of a request                                            | No          | Yes                                    |
| View team and workload                                                  | Everyone    | Manager and active coworkers, no email |
| View someone's insights                                                 | Anyone      | Only their own (Profile)               |
| Create users, activate / deactivate, reset passwords                    | Yes         | No                                     |
| Change own password, sign out everywhere                                | Yes         | Yes                                    |

Decisions where the brief was open:

- The manager owns what a request is and the employee owns the work. Only managers edit details and priority. Only the assigned employee starts and resolves work; the manager tracks progress and can send resolved work back by reopening it. Every save is explicit: changes to assignee, priority or details wait for a Save changes button, and closing an edited form asks before discarding.
- Managers are never assignees. The manager triages and hands out work, and only active employees can own a request. The server rejects assigning a manager and the assignee pickers list employees only. For the same reason managers have no My requests page, and their dashboard shows the team's workload instead of their own.
- Managers dispatch all work. Employees report requests, which start Open, Unassigned and Normal with no deadline, and the manager reviews them in To review, setting priority, deadline and owner in one step. Employees cannot assign anything, including to themselves.
- Employees can reopen their own resolved requests if they find the fix did not hold.
- Employees see the Team page with their manager set apart from their coworkers, so the hierarchy is clear. Coworkers' emails and insights stay private. Managers see their employees (other managers sit in a separate section) and open anyone's insights.
- There is no email service, so passwords are not reset by email. A manager issues a one-time temporary password; the person must choose their own before they can do anything else, and every session they had is ended. New accounts work the same way. If no manager can sign in, `npm run user:reset-password -- <email>` on the server does the same. The last active manager cannot be deactivated.
- Deadlines are optional: a date, plus an optional time (end of that day when left out). Forcing one on every request would produce made-up dates. A manager can also have the priority rise automatically in the last 24 hours before the deadline; a server check runs every minute, applies it once and never lowers a priority.
- When someone leaves for good, a manager deactivates the account and can then delete it, confirming by typing the person's name. A deleted account can never sign in, leaves the team lists and frees its email, but its row is kept: every request, note and history entry still shows who did the work, and the account records when and by whom it was deleted. Nobody can delete their own account or the last manager.

## Request lifecycle

```
OPEN ──▶ IN_PROGRESS ──▶ RESOLVED
  │                         ▲  │
  └─────────────────────────┘  │
  ▲                            │
  └────────── reopen ──────────┘
```

- New requests are always `OPEN`.
- `IN_PROGRESS` needs an active assignee.
- Moving from `IN_PROGRESS` back to `OPEN` is not allowed (not in the brief). Unassigning an in-progress request moves it back to `OPEN` automatically, since in-progress without an owner would break the rule above.
- Resolving stores `resolvedBy` and `resolvedAt`. Reopening clears both; the activity log keeps the old values.
- A resolved request cannot be edited or reassigned until it is reopened. Notes are still allowed, so people can add follow-up context.

## Accounts

- No public sign-up. Accounts come from the seed or are created by a manager.
- Deactivating a user revokes their sessions, blocks login and unassigns their unresolved requests, all in one transaction and recorded in the activity history. Their past work stays.
- A manager cannot deactivate themselves, so the system always keeps at least one manager able to sign in.
- Nothing is ever hard-deleted. Foreign keys use `RESTRICT`.

## Data entry rules

- Title needs at least 3 characters, requester name at least 2, description at least 10. Empty fields are rejected with a message under the field.
- Contact information is one field with a type picker. A phone number is digits with an optional leading + (6 to 15 digits). An email must look like name@company.com. An extension is 2 to 6 digits and is stored as `ext. 214`. The server applies the same rules, so data saved through the API is just as clean.

## Technical

- Single company, single timezone. Dates are stored in UTC and shown in the browser's locale.
- Small team (tens of users, thousands of requests). SQLite is enough.
- Sessions last 8 hours and slide forward while in use.
- Search matches reference, title, requester name, requester contact and description, case-insensitive for ASCII (SQLite `LIKE`).

## Out of scope

- Email/phone/chat integrations, notifications, attachments, SLAs, multi-tenant, public sign-up, password reset, request deletion.
