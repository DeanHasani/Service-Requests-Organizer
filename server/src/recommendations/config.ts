/**
 * Every tunable number behind smart assignment, in one place. The algorithm itself is in
 * `score.ts` and is documented in docs/recommendations.md.
 */
export const RECOMMENDATION_CONFIG = {
  /** Share of the final score each signal contributes. Must add up to 1. */
  weights: {
    /** Relevant experience: how much this person has resolved in the request's category. */
    experience: 0.3,
    /** Outcomes: how often their fixes in this category held (were not reopened). */
    success: 0.25,
    /** Speed against the team on the same category and priority. */
    speed: 0.1,
    /** Room to take it on: lighter current workload scores higher. */
    workload: 0.3,
    /** General experience across all categories (the fallback when category history is thin). */
    general: 0.05,
  },
  /**
   * Experience saturates instead of growing forever: `resolved / (resolved + halfAt)`. At
   * `halfAt` resolutions the experience signal is 0.5, so volume alone can't dominate.
   */
  experienceHalfAt: 4,
  generalHalfAt: 12,
  /**
   * Success is smoothed towards the team's rate with this many "virtual" resolutions, so one
   * lucky fix is not treated as proof of expertise.
   */
  successPriorWeight: 4,
  /** Fallback success rate when the team itself has no history yet. */
  defaultTeamSuccess: 0.85,
  /** Speed ratios are pulled towards "typical" (1) with this many virtual samples. */
  speedPriorWeight: 3,
  /** Below this many category resolutions, rates and times are not shown as facts. */
  minSample: 3,
  /** Active requests at which someone counts as fully loaded (workload signal reaches 0). */
  fullLoad: 6,
  /** Each overdue request counts as this many active ones for workload. */
  overdueWeight: 1.5,
  /** At or above `fullLoad`, the whole score is multiplied by this: excessive load is penalised. */
  overloadedFactor: 0.6,
  /** How many candidates to return (best first). */
  maxCandidates: 4,
} as const;

export type RecommendationConfig = typeof RECOMMENDATION_CONFIG;
