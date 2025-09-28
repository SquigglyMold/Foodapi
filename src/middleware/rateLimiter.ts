import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { APIResponse } from '../types';

/**
 * General API rate limiter
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
    data: null
  } as APIResponse<null>,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    const response: APIResponse<null> = {
      success: false,
      error: 'Rate limit exceeded',
      message: `Too many requests from IP ${req.ip}. Please try again in 15 minutes.`,
      data: null
    };
    res.status(429).json(response);
  }
});

/**
 * Strict rate limiter for search endpoints
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 search requests per minute
  message: {
    success: false,
    error: 'Search rate limit exceeded',
    message: 'Too many search requests. Please wait before searching again.',
    data: null
  } as APIResponse<null>,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const response: APIResponse<null> = {
      success: false,
      error: 'Search rate limit exceeded',
      message: `Too many search requests from IP ${req.ip}. Please wait 1 minute before searching again.`,
      data: null
    };
    res.status(429).json(response);
  }
});

/**
 * Health check rate limiter (more lenient)
 */
export const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Allow more health check requests
  message: {
    success: false,
    error: 'Health check rate limit exceeded',
    message: 'Too many health check requests.',
    data: null
  } as APIResponse<null>,
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Get rate limit info for response headers
 */
export const getRateLimitInfo = (req: Request): any => {
  const rateLimitInfo: any = {};
  
  if ((req as any).rateLimit) {
    rateLimitInfo.limit = (req as any).rateLimit.limit;
    rateLimitInfo.remaining = (req as any).rateLimit.remaining;
    rateLimitInfo.reset = new Date((req as any).rateLimit.resetTime);
  }
  
  return rateLimitInfo;
};
