# Glossary

**Request**: one unit of work a customer or colleague asked for, registered manually by a staff member. Has exactly one status at a time.

**Reference**: the human-readable identifier of a request, `SR-` followed by six digits. Never reused.

**Requester**: the person who asked for the work. Not a user of the system; only their name and contact details are stored.

**Source**: the channel the requester used: phone, email, message or other. Informational only.

**Assignee**: the single active employee responsible for a request. A request can be unassigned.

**Review queue (To review)**: open, unassigned requests waiting for a manager to set priority, deadline and owner. Employees cannot claim work; the manager assigns it.

**Deadline**: when a manager expects a request resolved: a date, plus an optional time (no time means end of that day). Optional. Overdue means past it and not resolved. Requests show a live countdown to it.

**Category**: what kind of issue a request is: Hardware, Software, Network, Account access, Facilities or General support. Whoever reports it picks one; a manager can correct it. Requests from before categories existed show as Uncategorised.

**Manager insights (Insights)**: the manager-only page with team-wide numbers for the last 7, 30 or 90 days or all time: key metrics, status, priority and category mix, trends, reopened and inactive requests, and each employee's workload and outcomes with sample sizes.

**Smart assignment**: suggestions for who should take an unassigned request, worked out from the team's real history and current workload. Suggestions only; a manager always confirms the assignment.

**Fix that held**: a resolution that was not reopened afterwards. A request that is reopened counts against the resolution before it.

**Gone quiet**: an open request with no changes or notes for 5 days or more.

**Working priority**: the priority to work by. Normally the priority people chose; while a deadline is close or past, the deadline monitor raises it (one step, or two once overdue, never past Urgent, at least the manager's minimum if set). The chosen priority is never overwritten.

**Deadline status**: on track, due soon (approaching: within 24 hours), overdue, or completed. Separate from the request's lifecycle status.

**Deadline monitor**: the server job that checks deadlines every minute and at startup, updates deadline status and working priority, records automatic events (shown as DESKFLOW) and sends reminders.

**Notification**: an in-app message for one person (bell icon), about an assignment or a deadline. Each reminder is sent once per stage and deadline cycle.

**Needs attention / Your deadlines**: dashboard lists of requests close to or past their deadline, with time left and the next step.

**Temporary password**: a one-time password from a manager (on reset or for a new account). The holder must choose their own before using the app.

**Status**: where the request is in its lifecycle: Open, In progress or Resolved.

**Resolve**: move a request to Resolved. Records who resolved it and when.

**Reopen**: move a Resolved request back to Open. Clears the current resolution; history keeps it.

**Note**: an internal comment on a request, visible to all staff, never to the requester.

**Activity**: an automatic, append-only record of something that changed on a request.

**Manager**: a user who creates and edits requests, hands them out to employees, tracks their progress and manages accounts. A manager can reopen resolved work but never starts or resolves it and is never an assignee.

**Employee**: a user who sees all requests and does the work on the ones assigned to them: starts it, adds notes, resolves it.

**Active workload**: the number of requests assigned to a user that are not Resolved.

**Deactivated user**: a user who can no longer sign in or be assigned. Their past work and history stay.
