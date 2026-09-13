import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { APIResponse } from '../types';

const makeHandler = (msg: string) => (req: Request, res: Response) => {
  const response: APIResponse<null> = {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: msg,
    data: null,
  };
  res.status(429).json(response);
};

/** General: 100 req / 15 min */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many requests from this IP. Please try again in 15 minutes.'),
});

/** Search / lookup: 30 req / min (raised from 10 — more lenient for developer testing) */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many search requests. Please wait before sending more.'),
});

/** Batch / calculator: 5 req / min (heavy calls — concurrent USDA fetches) */
export const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Batch/calculator rate limit exceeded. These endpoints make multiple upstream calls. Please wait 1 minute.'),
});

/** Health check: 60 req / min */
export const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Health check rate limit exceeded.'),
});

export const getRateLimitInfo = (req: Request): any => {
  const rl: any = {};
  if ((req as any).rateLimit) {
    rl.limit     = (req as any).rateLimit.limit;
    rl.remaining = (req as any).rateLimit.remaining;
    rl.reset     = new Date((req as any).rateLimit.resetTime);
  }
  return rl;
};
