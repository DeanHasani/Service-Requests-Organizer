import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { DUMMY_HASH } from '../src/routes';
import { BCRYPT_ROUNDS } from '../src/services/users';
import { app, PASSWORD, resetDb, signIn } from './helpers';

beforeEach(resetDb);

it('uses the real bcrypt cost for unknown emails, so timing does not reveal which accounts exist', () => {
  expect(bcrypt.getRounds(DUMMY_HASH)).toBe(BCRYPT_ROUNDS);
});

it('rejects a non-ASCII CSRF token with 403, not a server error', async () => {
  await resetDb();
  const mia = await signIn('mia@test.dev');
  const res = await mia.agent
    .post('/api/auth/logout')
    .set('x-csrf-token', 'é'.repeat(mia.csrf.length));
  expect(res.status).toBe(403);
});

describe('authentication', () => {
  it('signs in with valid credentials and never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mia@test.dev', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'mia@test.dev', role: 'MANAGER' });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/deskflow_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('accepts email in any case', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'MIA@Test.dev', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mia@test.dev', password: 'nope-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect email or password',
    });
  });

  it('rejects an unknown email with the same message as a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'who@test.dev', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
  });

  it('rejects missing credentials with field errors', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('blocks deactivated accounts', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'gus@test.dev', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('returns the current user from /me', async () => {
    const mia = await signIn('mia@test.dev');
    const res = await mia.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('mia@test.dev');
    expect(res.body.data.csrfToken).toBe(mia.csrf);
  });

  it('logs out and invalidates the session', async () => {
    const mia = await signIn('mia@test.dev');
    expect((await mia.post('/api/auth/logout')).status).toBe(204);
    expect((await mia.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects unauthenticated API access', async () => {
    for (const url of [
      '/api/auth/me',
      '/api/requests',
      '/api/users',
      '/api/activity',
      '/api/dashboard',
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects a forged session cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('cookie', 'deskflow_sid=forged');
    expect(res.status).toBe(401);
  });

  it('expires sessions past their lifetime', async () => {
    const mia = await signIn('mia@test.dev');
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await mia.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    expect(await prisma.session.count()).toBe(0);
  });

  it('requires a CSRF token on state-changing calls', async () => {
    const mia = await signIn('mia@test.dev');
    const missing = await mia.agent.post('/api/auth/logout');
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('CSRF_INVALID');
    const wrong = await mia.agent
      .post('/api/auth/logout')
      .set('x-csrf-token', 'x'.repeat(mia.csrf.length));
    expect(wrong.status).toBe(403);
  });

  it('rate-limits repeated failed sign-ins', async () => {
    const limited = createApp({ loginLimit: 3 });
    for (let i = 0; i < 3; i++) {
      await request(limited)
        .post('/api/auth/login')
        .send({ email: 'mia@test.dev', password: 'wrong-pass' });
    }
    const res = await request(limited)
      .post('/api/auth/login')
      .send({ email: 'mia@test.dev', password: PASSWORD });
    expect(res.status).toBe(429);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const mia = await signIn('mia@test.dev');
    const res = await mia.get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
