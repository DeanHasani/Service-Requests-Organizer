# Smart assignment

Smart assignment suggests who should take an unassigned request. It is a transparent, rules-based engine that uses only DESKFLOW's own data: no external AI service, no machine learning, nothing predicted or invented. It never assigns anything itself; a manager always confirms.

## Where it appears

| Place                     | What the manager sees                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request page (unassigned) | The best match with a 0–100 match score, how many comparable requests they handled, how many fixes held (with sample size), typical time, current workload, reasons and cautions; up to three alternatives to compare and assign. Every assignment opens a confirmation. |
| To review                 | One line per request: the suggested person and a **Use** link that fills the assignee field. The manager still presses Assign.                                                                                                                                           |
| New request form          | Once a category is chosen: the suggested person and **Use**, which fills the assignee field.                                                                                                                                                                             |

Only managers can call the endpoints or see the panels; employees' permissions are unchanged.

## Code layout

| File                                      | Role                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `server/src/recommendations/config.ts`    | Every weight and threshold, in one place                                                              |
| `server/src/recommendations/score.ts`     | Pure scoring: no database, fully unit-tested                                                          |
| `server/src/recommendations/recommend.ts` | Reads the history from the database and calls the scoring                                             |
| `server/src/routes.ts`                    | `GET /api/requests/:id/recommendations` and `GET /api/recommendations?category=&priority=` (managers) |
| `client/src/components/SmartAssign.tsx`   | The panel and the one-line suggestion                                                                 |

## Data it uses

All of it comes from the `ActivityLog` and `Request` tables:

- **Resolutions:** every `RESOLVED` event, with who resolved it, the request's category and priority, and how long it took (from logging, or from the reopen that started that round of work).
- **Outcome:** a resolution _held_ unless the next event on that request is a `REOPENED`. Reopens therefore count against whoever resolved it.
- **Workload:** each active employee's unresolved assigned requests, and how many of those are overdue.

Deactivated and deleted accounts are never suggested.

## Scoring

Each candidate gets five signals between 0 and 1. They are combined with the weights in `config.ts`, which add up to 1, giving a 0–100 score.

| Signal     | Weight | How it is worked out                                                                                                                                                                                                                                                                                           |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experience | 0.30   | Resolutions in this category, saturating: `n / (n + 4)`. Four fixes give 0.5, twenty give 0.83, so volume alone cannot dominate.                                                                                                                                                                               |
| Outcomes   | 0.25   | Share of their fixes in this category that held, smoothed towards the team's rate with 4 virtual resolutions, then centred on the team rate. One lucky fix stays close to average.                                                                                                                             |
| Speed      | 0.10   | Their median time divided by the team's median for the **same category and priority**, smoothed towards 1 with 3 virtual samples, on a log scale (twice as fast → 1, typical → 0.5, twice as slow → 0). Comparing like with like means someone who mostly gets easy, low-priority work is not rewarded for it. |
| Workload   | 0.30   | `1 − load / 6`, where overdue requests count 1.5 each. At 6 active requests or more the whole score is also multiplied by 0.6.                                                                                                                                                                                 |
| General    | 0.05   | Resolutions across all categories, saturating at `n / (n + 12)`. This is the fallback when nobody has history in the category.                                                                                                                                                                                 |

Ties are broken by lighter workload, then by name, so the result is always the same for the same data.

## Honesty about thin data

- **Confidence** per candidate: `solid` (3 or more resolutions in the category), `limited` (1–2) or `none`.
- Success rates, typical times and speed comparisons are only returned at `solid`. Below that the UI shows the raw count ("2 resolved, too few to judge").
- The panel says what the top suggestion rests on: history, limited history, or workload and general experience only, when nobody has resolved this kind of request.
- The score is described as a comparison between these people for this request, not a rating of anyone.

## Changing the behaviour

Edit `server/src/recommendations/config.ts`. The tests in `server/tests/recommendations.test.ts` check the rules (experience over volume, sample size, reopens, like-for-like speed, workload penalties, fair fallback, determinism) rather than exact numbers, so reasonable re-tuning keeps them passing. The weights must still add up to 1, and a test checks that.
