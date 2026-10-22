import { redactSecrets } from './crypto.js';

export interface LogContext {
  requestId?: string | undefined;
  userId?: string | undefined;
  path?: string | undefined;
  method?: string | undefined;
  [key: string]: unknown;
}

export const logger = {
  info(message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const safeContext = (context ? redactSecrets(context) : {}) as Record<string, unknown>;
    console.log(JSON.stringify({ timestamp, level: 'INFO', message, ...safeContext }));
  },

  warn(message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const safeContext = (context ? redactSecrets(context) : {}) as Record<string, unknown>;
    console.warn(JSON.stringify({ timestamp, level: 'WARN', message, ...safeContext }));
  },

  error(message: string, error?: unknown, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const safeContext = (context ? redactSecrets(context) : {}) as Record<string, unknown>;
    const errMessage = error instanceof Error ? error.message : String(error);
    const stack = process.env.NODE_ENV !== 'production' && error instanceof Error ? error.stack : undefined;
    console.error(JSON.stringify({ timestamp, level: 'ERROR', message, error: errMessage, stack, ...safeContext }));
  },

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      const timestamp = new Date().toISOString();
      const safeContext = (context ? redactSecrets(context) : {}) as Record<string, unknown>;
      console.debug(JSON.stringify({ timestamp, level: 'DEBUG', message, ...safeContext }));
    }
  },
};
