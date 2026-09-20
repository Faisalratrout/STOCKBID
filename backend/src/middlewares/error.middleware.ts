import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));
};

/** Central error handler. Never leaks stack traces or internals to clients. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res
        .status(409)
        .json({ success: false, error: { code: 'CONFLICT', message: 'Resource already exists' } });
    }
    if (err.code === 'P2025') {
      return res
        .status(404)
        .json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }
  }

  if (err instanceof MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: tooLarge ? 'File is too large' : 'Invalid file upload',
      },
    });
  }

  // Malformed JSON body rejected by express.json()
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ success: false, error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } });
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};
