import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, 'FORBIDDEN', message);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
export const rule = (code: string, message: string) => new AppError(422, code, message);
export const staleVersion = () =>
  conflict('Someone else changed this request. Reload to see the latest version.', 'STALE_VERSION');

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const { formErrors, fieldErrors } = z.flattenError(result.error);
  const details = { ...(fieldErrors as Record<string, string[]>) };
  if (formErrors.length) details._ = formErrors;
  const first = formErrors[0] ?? Object.values(details)[0]?.[0] ?? 'Invalid input';
  throw new AppError(400, 'VALIDATION_ERROR', first, details);
}

export const notFoundRoute: RequestHandler = (_req, _res, next) => next(notFound('Route'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res
      .status(409)
      .json({ error: { code: 'DUPLICATE', message: 'A record with that value already exists' } });
    return;
  }
  // Log the error class and message only; never the request body (may contain passwords).
  console.error(`[error] ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
  res
    .status(500)
    .json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
};
