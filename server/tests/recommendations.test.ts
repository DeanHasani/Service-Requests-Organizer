import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { RECOMMENDATION_CONFIG } from '../src/recommendations/config';
import {
  basisOf,
  scoreCandidate,
  scoreCandidates,
  type CandidateStats,
} from '../src/recommendations/score';
import { createRequest, resetDb, signIn, type Client, type Users } from './helpers';

// ---------- pure scoring ----------

const person = (
  id: number,
  name: string,
  over: Partial<Omit<CandidateStats, 'user'>> = {},
): CandidateStats => ({
  user: { id, name },
  categoryResolutions: [],
  generalResolved: 0,
  active: 0,
  overdue: 0,
  ...over,
});
/** n resolutions of `hours` each where the team typically takes `team` hours. */
const fixes = (n: number, { held = n, hours = 10, team = 10 } = {}) =>
  Array.from({ length: n }, (_, i) => ({ held: i < held, hours, teamMedianHours: team }));

describe('smart assignment scoring', () => {
  it('weights add up to 1, so scores stay on a 0–100 scale', () => {
    const sum = Object.values(RECOMMENDATION_CONFIG.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('prefers relevant, successful experience over raw volume elsewhere', () => {
    const specialist = person(1, 'Spec', { categoryResolutions: fixes(6), generalResolved: 6 });
    const generalist = person(2, 'Gen', { generalResolved: 40 });
    const [top] = scoreCandidates([generalist, specialist], 'NETWORK', 0.85);
    expect(top!.user.name).toBe('Spec');
  });

  it('does not treat one lucky fix as expertise', () => {
    const one = scoreCandidate(
      person(1, 'One', { categoryResolutions: fixes(1) }),
      'NETWORK',
      0.85,
    );
    const eight = scoreCandidate(
      person(2, 'Eight', { categoryResolutions: fixes(8) }),
      'NETWORK',
      0.85,
    );
    expect(eight.score).toBeGreaterThan(one.score);
    // No rate or time is shown as a fact below the minimum sample.
    expect(one.confidence).toBe('limited');
    expect(one.category.successRate).toBeNull();
    expect(one.category.medianHours).toBeNull();
    expect(one.reasons[0]).toMatch(/too few to judge/);
    expect(eight.confidence).toBe('solid');
    expect(eight.category.successRate).toBe(1);
  });

  it('counts reopened fixes against someone', () => {
    const solid = scoreCandidate(
      person(1, 'A', { categoryResolutions: fixes(6) }),
      'SOFTWARE',
      0.85,
    );
    const shaky = scoreCandidate(
      person(2, 'B', { categoryResolutions: fixes(6, { held: 3 }) }),
      'SOFTWARE',
      0.85,
    );
    expect(solid.score).toBeGreaterThan(shaky.score);
    expect(shaky.category.successRate).toBe(0.5);
    expect(shaky.cautions.join(' ')).toMatch(/reopened/);
  });

  it('compares speed against the team on similar work, not raw hours', () => {
    // Same raw hours; one is fast for that kind of request, the other slow.
    const quick = scoreCandidate(
      person(1, 'Quick', { categoryResolutions: fixes(6, { hours: 10, team: 20 }) }),
      'HARDWARE',
      0.85,
    );
    const slow = scoreCandidate(
      person(2, 'Slow', { categoryResolutions: fixes(6, { hours: 10, team: 5 }) }),
      'HARDWARE',
      0.85,
    );
    expect(quick.score).toBeGreaterThan(slow.score);
    expect(quick.category.speedRatio!).toBeLessThan(1);
    expect(slow.cautions.join(' ')).toMatch(/slower/);
  });

  it('penalises heavy workload, and excessive load strongly', () => {
    const base = { categoryResolutions: fixes(6), generalResolved: 6 };
    const free = scoreCandidate(person(1, 'Free', base), 'ACCESS', 0.85);
    const busy = scoreCandidate(person(2, 'Busy', { ...base, active: 4 }), 'ACCESS', 0.85);
    const full = scoreCandidate(
      person(3, 'Full', { ...base, active: RECOMMENDATION_CONFIG.fullLoad }),
      'ACCESS',
      0.85,
    );
    expect(free.score).toBeGreaterThan(busy.score);
    expect(busy.score).toBeGreaterThan(full.score);
    expect(full.cautions[0]).toMatch(/At capacity/);
  });

  it('lets a free newcomer beat an overloaded expert', () => {
    const expert = person(1, 'Expert', {
      categoryResolutions: fixes(10),
      generalResolved: 20,
      active: 7,
      overdue: 2,
    });
    const newcomer = person(2, 'Newcomer', { generalResolved: 3 });
    const [top] = scoreCandidates([expert, newcomer], 'NETWORK', 0.85);
    expect(top!.user.name).toBe('Newcomer');
    expect(basisOf(top)).toBe('workload');
  });

  it('falls back fairly when nobody has history: workload, then general experience', () => {
    const ranked = scoreCandidates(
      [
        person(1, 'Busy', { active: 3, generalResolved: 10 }),
        person(2, 'Free', { active: 0, generalResolved: 2 }),
        person(3, 'Free veteran', { active: 0, generalResolved: 15 }),
      ],
      'FACILITIES',
      0.85,
    );
    expect(ranked.map((c) => c.user.name)).toEqual(['Free veteran', 'Free', 'Busy']);
    expect(ranked.every((c) => c.confidence === 'none')).toBe(true);
    expect(ranked[0]!.reasons[0]).toMatch(/No Facilities history yet/);
  });

  it('is deterministic: ties go to the lighter workload, then by name', () => {
    const a = person(1, 'Bea', {});
    const b = person(2, 'Ada', {});
    const once = scoreCandidates([a, b], 'OTHER', 0.85).map((c) => c.user.name);
    const again = scoreCandidates([b, a], 'OTHER', 0.85).map((c) => c.user.name);
    expect(once).toEqual(['Ada', 'Bea']);
    expect(again).toEqual(once);
  });

  it('returns at most the configured number of candidates', () => {
    const many = Array.from({ length: 9 }, (_, i) => person(i + 1, `P${i}`));
    expect(scoreCandidates(many, 'OTHER', 0.85)).toHaveLength(RECOMMENDATION_CONFIG.maxCandidates);
  });
});

// ---------- endpoints, on real history ----------

let users: Users;
let mia: Client;
let ann: Client;
let bob: Client;

beforeEach(async () => {
  users = await resetDb();
  [mia, ann, bob] = (await Promise.all(
    ['mia@test.dev', 'ann@test.dev', 'bob@test.dev'].map(signIn),
  )) as [Client, Client, Client];
});

/** Ann resolves `n` network requests; optionally the manager reopens some of them. */
async function annFixesNetwork(n: number, reopen = 0) {
  for (let i = 0; i < n; i++) {
    const r = await createRequest(mia, { category: 'NETWORK', assignedToId: users.ann.id });
    await ann.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });
    if (i < reopen) await mia.patch(`/api/requests/${r.id}/status`, { status: 'OPEN', version: 1 });
  }
}

describe('smart assignment endpoints', () => {
  it('suggests the person with relevant history, with reasons and sample sizes', async () => {
    await annFixesNetwork(4);
    const target = await createRequest(mia, { category: 'NETWORK' });
    const res = await mia.get(`/api/requests/${target.id}/recommendations`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toMatchObject({ category: 'NETWORK', basis: 'experience', teamSample: 4 });
    const [top, next] = data.candidates;
    expect(top).toMatchObject({
      user: { id: users.ann.id },
      confidence: 'solid',
      category: { resolved: 4, held: 4, successRate: 1 },
    });
    expect(top.reasons[0]).toMatch(/Resolved 4 Network requests/);
    expect(next.user.id).toBe(users.bob.id);
    expect(next.confidence).toBe('none');
    // Deactivated people are never suggested.
    expect(data.candidates.some((c: { user: { id: number } }) => c.user.id === users.gone.id)).toBe(
      false,
    );
  });

  it('never assigns anything by itself', async () => {
    await annFixesNetwork(3);
    const target = await createRequest(mia, { category: 'NETWORK' });
    await mia.get(`/api/requests/${target.id}/recommendations`);
    expect(
      (await prisma.request.findUniqueOrThrow({ where: { id: target.id } })).assignedToId,
    ).toBe(null);
  });

  it('says plainly when there is no history to go on', async () => {
    const res = await mia.get('/api/recommendations?category=FACILITIES&priority=HIGH');
    expect(res.body.data).toMatchObject({ basis: 'workload', teamSample: 0 });
    for (const c of res.body.data.candidates) {
      expect(c.confidence).toBe('none');
      expect(c.category.successRate).toBeNull();
    }
  });

  it('counts a reopened fix as a fix that did not hold', async () => {
    await annFixesNetwork(4, 2);
    const res = await mia.get('/api/recommendations?category=NETWORK');
    const ann_ = res.body.data.candidates.find(
      (c: { user: { id: number } }) => c.user.id === users.ann.id,
    );
    expect(ann_.category).toMatchObject({ resolved: 4, held: 2, successRate: 0.5 });
  });

  it('is for managers only and validates its input', async () => {
    const r = await createRequest(mia, { category: 'NETWORK' });
    expect((await ann.get(`/api/requests/${r.id}/recommendations`)).status).toBe(403);
    expect((await bob.get('/api/recommendations?category=NETWORK')).status).toBe(403);
    expect((await mia.get('/api/recommendations?category=PLUMBING')).status).toBe(400);
    expect((await mia.get('/api/requests/9999/recommendations')).status).toBe(404);
  });

  it('refuses resolved and uncategorised requests with a clear reason', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    await ann.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });
    expect((await mia.get(`/api/requests/${r.id}/recommendations`)).body.error.code).toBe(
      'REQUEST_RESOLVED',
    );
    const old = await createRequest(mia);
    await prisma.request.update({ where: { id: old.id }, data: { category: null } });
    expect((await mia.get(`/api/requests/${old.id}/recommendations`)).body.error.code).toBe(
      'CATEGORY_REQUIRED',
    );
  });
});
