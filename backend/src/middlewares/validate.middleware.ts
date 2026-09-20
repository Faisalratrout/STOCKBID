import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError';

interface Schemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Validates external input at the API boundary. Parsed (coerced, stripped) values
 * replace the originals. Express 5 makes req.query read-only, so the parsed query
 * is exposed on res.locals.query instead.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, res, next) => {
    const issues: { in: string; path: string; message: string }[] = [];
    const run = (where: 'body' | 'params' | 'query', schema?: ZodType) => {
      if (!schema) return undefined;
      const result = schema.safeParse(req[where]);
      if (result.success) return result.data;
      for (const i of result.error.issues) {
        issues.push({ in: where, path: i.path.join('.'), message: i.message });
      }
      return undefined;
    };

    const body = run('body', schemas.body);
    const params = run('params', schemas.params);
    const query = run('query', schemas.query);
    if (issues.length) return next(ApiError.validation(issues));

    if (schemas.body) req.body = body;
    if (schemas.params) Object.assign(req.params, params);
    if (schemas.query) res.locals.query = query;
    next();
  };
