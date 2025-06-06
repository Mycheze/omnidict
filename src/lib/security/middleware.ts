import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, validateOrigin, sanitizeError } from './validation';

export interface SecurityOptions {
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  requireOriginValidation?: boolean;
  logErrors?: boolean;
}

export function withSecurity<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>,
  options: SecurityOptions = {}
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const startTime = Date.now();
    
    try {
      // Get client identifier for rate limiting - Fixed for production builds
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                request.headers.get('x-real-ip') || 
                request.headers.get('cf-connecting-ip') || // Cloudflare
                request.headers.get('x-client-ip') ||
                'unknown';

      // Rate limiting
      if (options.rateLimit) {
        const { maxRequests, windowMs } = options.rateLimit;
        if (!checkRateLimit(ip, maxRequests, windowMs)) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Too many requests. Please try again later.' 
            },
            { 
              status: 429,
              headers: {
                'Retry-After': Math.ceil(windowMs / 1000).toString(),
              }
            }
          );
        }
      }

      // CSRF protection for state-changing operations
      if (options.requireOriginValidation && 
          ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
        if (!validateOrigin(request)) {
          return NextResponse.json(
            { success: false, error: 'Invalid request origin' },
            { status: 403 }
          );
        }
      }

      // Add security headers
      const response = await handler(request, ...args);
      
      // Add security headers to response
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Add timing header for monitoring
      const duration = Date.now() - startTime;
      response.headers.set('X-Response-Time', `${duration}ms`);

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log error if enabled
      if (options.logErrors !== false) {
        console.error('API Error:', {
          method: request.method,
          url: request.url,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }

      // Return sanitized error
      const sanitizedError = sanitizeError(error);
      const statusCode = error instanceof Error && 
                        error.message.includes('Validation') ? 400 : 500;

      return NextResponse.json(
        { success: false, error: sanitizedError },
        { 
          status: statusCode,
          headers: {
            'X-Response-Time': `${duration}ms`,
          }
        }
      );
    }
  };
}

// Predefined security configurations
export const DEFAULT_SECURITY = {
  rateLimit: { maxRequests: 100, windowMs: 60000 }, // 100 requests per minute
  requireOriginValidation: true,
  logErrors: true,
};

export const STRICT_SECURITY = {
  rateLimit: { maxRequests: 50, windowMs: 60000 }, // 50 requests per minute
  requireOriginValidation: true,
  logErrors: true,
};

export const RELAXED_SECURITY = {
  rateLimit: { maxRequests: 200, windowMs: 60000 }, // 200 requests per minute
  requireOriginValidation: false,
  logErrors: true,
};