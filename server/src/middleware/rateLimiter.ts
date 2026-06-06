import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

interface RateLimiterConfig {
  windowMs?: number;
  max?: number;
  message?: string;
}

export function createRateLimiter(config: RateLimiterConfig = {}) {
  const {
    windowMs = 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later.',
  } = config;

  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response, _next: NextFunction) => {
      res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
}
