import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Role } from '@deskflow/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/db';

export const PASSWORD = 'correct-horse-9';
export const app = createApp();

export type Users = Awaited<ReturnType<typeof resetDb>>;

/** Empties every table and creates a known cast of users. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.activityLog.deleteMany(),
    prisma.requestNote.deleteMany(),
    prisma.request.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.updateMany({ data: { deletedById: null } }),
    prisma.user.deleteMany(),
    prisma.counter.deleteMany(),
  ]);
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const make = (name: string, email: string, role: Role, isActive = true) =>
    prisma.user.create({ data: { name, email, role, isActive, passwordHash } });
  return {
    manager: await make('Mia Manager', 'mia@test.dev', 'MANAGER'),
    ann: await make('Ann Employee', 'ann@test.dev', 'EMPLOYEE'),
    bob: await make('Bob Employee', 'bob@test.dev', 'EMPLOYEE'),
    gone: await make('Gus Gone', 'gus@test.dev', 'EMPLOYEE', false),
  };
}

/** A signed-in client that sends the session cookie and CSRF header automatically. */
export async function signIn(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200)
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf: string = res.body.data.csrfToken;
  return {
    agent,
    csrf,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set('x-csrf-token', csrf).send(body),
    patch: (url: string, body?: object) => agent.patch(url).set('x-csrf-token', csrf).send(body),
  };
}
export type Client = Awaited<ReturnType<typeof signIn>>;

export const validRequest = (overrides: Record<string, unknown> = {}) => ({
  title: 'Printer offline',
  description: 'The 2nd floor printer shows offline.',
  requesterName: 'Laura Bennett',
  requesterContact: 'laura@example.com',
  source: 'PHONE',
  priority: 'HIGH',
  clientRequestId: randomUUID(),
  ...overrides,
});

export async function createRequest(client: Client, overrides: Record<string, unknown> = {}) {
  const res = await client.post('/api/requests', validRequest(overrides));
  if (res.status !== 201)
    throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: number; version: number; referenceNumber: string; status: string };
}
