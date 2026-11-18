/**
 * Smart assignment scoring: pure functions, no database, so the rules can be read and tested on
 * their own. `recommend.ts` gathers the history and calls `scoreCandidates`.
 *
 * Each candidate gets five signals between 0 and 1, combined with the weights in `config.ts`:
 *
 * - experience: resolutions in this category, saturating (`n / (n + halfAt)`), so 20 fixes is not
 *   worth five times 4 fixes.
 * - success: share of their fixes in this category that held (no reopen afterwards), smoothed
 *   towards the team's rate so a small sample stays close to average. Reopens count against it.
 * - speed: their median time against the team's median for the same category AND priority, so
 *   someone who mostly gets easy, low-priority work is not rewarded for it. Also smoothed.
 * - workload: fewer active (and overdue) requests is better; at full load the signal is 0 and the
 *   whole score is multiplied down.
 * - general: experience across all categories, the fallback when nobody has category history.
 *
 * The result is deterministic: equal scores are ordered by lighter workload, then by name.
 */
import { CATEGORY_LABEL, type Candidate, type Category } from '@deskflow/shared';
import { RECOMMENDATION_CONFIG, type RecommendationConfig } from './config';

/** What we know about one employee, already counted from the database. */
export type CandidateStats = {
  user: { id: number; name: string };
  /** In the request's category: each resolution, whether it held, and how long it took. */
  categoryResolutions: { held: boolean; hours: number; teamMedianHours: number | null }[];
  generalResolved: number;
  active: number;
  overdue: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** "about 2 days" / "about 5 hours", for reasons written in plain language. */
const humanHours = (h: number) =>
  h >= 36 ? `about ${Math.round(h / 24)} days` : `about ${Math.max(1, Math.round(h))} hours`;

export function scoreCandidate(
  stats: CandidateStats,
  category: Category,
  teamSuccess: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): Candidate {
  const c = config;
  const label = CATEGORY_LABEL[category];
  const n = stats.categoryResolutions.length;
  const held = stats.categoryResolutions.filter((r) => r.held).length;

  // Experience and general experience saturate.
  const experience = n / (n + c.experienceHalfAt);
  const general = stats.generalResolved / (stats.generalResolved + c.generalHalfAt);

  // Success, smoothed towards the team's rate by `successPriorWeight` virtual resolutions.
  const smoothedSuccess = (held + teamSuccess * c.successPriorWeight) / (n + c.successPriorWeight);
  // Centre on the team rate: average outcomes give 0.5, better above, worse below.
  const success = clamp01(0.5 + (smoothedSuccess - teamSuccess) * 2.5);

  // Speed against the team on the same category and priority, smoothed towards 1 (typical).
  const ratios = stats.categoryResolutions
    .filter((r) => r.teamMedianHours && r.teamMedianHours > 0)
    .map((r) => r.hours / r.teamMedianHours!);
  const rawRatio = median(ratios);
  const smoothedRatio =
    rawRatio === null
      ? 1
      : (rawRatio * ratios.length + c.speedPriorWeight) / (ratios.length + c.speedPriorWeight);
  // Twice as fast as typical → 1, typical → 0.5, twice as slow → 0.
  const speed = clamp01(0.5 - Math.log2(smoothedRatio) / 2);

  // Workload: overdue work weighs more; full load or beyond gives 0.
  const load = stats.active + stats.overdue * (c.overdueWeight - 1);
  const workload = clamp01(1 - load / c.fullLoad);
  const overloaded = stats.active >= c.fullLoad;

  const w = c.weights;
  let score =
    w.experience * experience +
    w.success * success +
    w.speed * speed +
    w.workload * workload +
    w.general * general;
  if (overloaded) score *= c.overloadedFactor;

  const enough = n >= c.minSample;
  const confidence: Candidate['confidence'] = enough ? 'solid' : n > 0 ? 'limited' : 'none';
  const successRate = enough ? held / n : null;
  const medianHours = enough ? median(stats.categoryResolutions.map((r) => r.hours)) : null;

  // ---------- plain-language reasons and cautions ----------
  const reasons: string[] = [];
  const cautions: string[] = [];
  if (n === 0) {
    reasons.push(
      stats.generalResolved
        ? `No ${label} history yet; has resolved ${stats.generalResolved} request${stats.generalResolved === 1 ? '' : 's'} in other categories`
        : 'No resolved requests yet',
    );
  } else if (enough) {
    reasons.push(
      `Resolved ${n} ${label} request${n === 1 ? '' : 's'}; ${held} held without being reopened`,
    );
  } else {
    reasons.push(`Some ${label} experience: ${n} resolved, too few to judge yet`);
  }
  if (enough && rawRatio !== null && ratios.length >= c.minSample) {
    if (smoothedRatio <= 0.85)
      reasons.push(
        `Usually quicker than the team on similar requests (${humanHours(medianHours!)})`,
      );
    else if (smoothedRatio >= 1.25)
      cautions.push(
        `Usually slower than the team on similar requests (${humanHours(medianHours!)})`,
      );
  }
  if (stats.active === 0) reasons.push('Free right now: no active requests');
  else if (!overloaded && stats.active <= 2) reasons.push(`Light workload: ${stats.active} active`);
  if (overloaded) cautions.push(`At capacity: ${stats.active} active requests`);
  else if (stats.active >= c.fullLoad / 2) cautions.push(`Busy: ${stats.active} active requests`);
  if (stats.overdue) cautions.push(`${stats.overdue} overdue already`);
  if (n - held >= 2 || (enough && held / n < teamSuccess - 0.15))
    cautions.push(`${n - held} of their ${label} fixes were reopened`);

  return {
    user: stats.user,
    score: Math.round(score * 100),
    confidence,
    category: {
      resolved: n,
      held,
      successRate: successRate === null ? null : Math.round(successRate * 100) / 100,
      medianHours: medianHours === null ? null : round1(medianHours),
      speedRatio: enough && rawRatio !== null ? Math.round(smoothedRatio * 100) / 100 : null,
    },
    generalResolved: stats.generalResolved,
    workload: { active: stats.active, overdue: stats.overdue },
    reasons,
    cautions,
  };
}

/** Scores everyone and returns the best few, best first. */
export function scoreCandidates(
  all: CandidateStats[],
  category: Category,
  teamSuccess: number,
  config: RecommendationConfig = RECOMMENDATION_CONFIG,
): Candidate[] {
  return all
    .map((s) => scoreCandidate(s, category, teamSuccess, config))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.workload.active - b.workload.active ||
        a.user.name.localeCompare(b.user.name),
    )
    .slice(0, config.maxCandidates);
}

/** What the top suggestion mostly rests on, so the UI can say so honestly. */
export function basisOf(top: Candidate | undefined): 'experience' | 'limited' | 'workload' {
  if (!top || top.confidence === 'none') return 'workload';
  return top.confidence === 'solid' ? 'experience' : 'limited';
}
