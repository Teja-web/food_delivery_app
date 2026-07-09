/**
 * Structured Logger
 *
 * Simple leveled logger with child context propagation.
 *
 * Configuration:
 * - LOG_LEVEL=debug|info|warn|error  (default: info in dev, warn in prod)
 * - LOG_FORMAT=pretty|json           (default: pretty when TTY, json otherwise)
 * - LOG_NONE=1                       (disable all except warn/error)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown): void;
  child(context: Record<string, unknown>): Logger;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',   // Gray
  info: '\x1b[36m',    // Cyan
  warn: '\x1b[33m',    // Yellow
  error: '\x1b[31m',   // Red
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return env as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info';
}

function shouldLog(level: LogLevel): boolean {
  if (process.env.LOG_NONE === '1' && level !== 'warn' && level !== 'error') {
    return false;
  }
  return LEVELS[level] >= LEVELS[getMinLevel()];
}

function isJsonFormat(): boolean {
  const env = process.env.LOG_FORMAT?.toLowerCase();
  if (env === 'json') return true;
  if (env === 'pretty') return false;
  return process.stdout.isTTY !== true;
}

function formatError(err: unknown): Record<string, unknown> | string {
  if (err instanceof Error) {
    return { message: err.message, ...(err.stack ? { stack: err.stack } : {}) };
  }
  return String(err);
}

function emit(
  level: LogLevel,
  name: string,
  message: string,
  context: Record<string, unknown>,
  extra?: Record<string, unknown> | unknown,
): void {
  try {
    if (isJsonFormat()) {
      const entry: Record<string, unknown> = {
        level,
        name,
        msg: message,
        ts: new Date().toISOString(),
        ...context,
      };
      if (extra !== undefined) {
        if (level === 'error') {
          entry.error = formatError(extra);
        } else if (typeof extra === 'object' && extra !== null) {
          Object.assign(entry, extra);
        }
      }
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(JSON.stringify(entry));
    } else {
      const useColors = process.stdout.isTTY !== false;
      const levelLabel = level.toUpperCase().padEnd(5);
      let prefix: string;
      if (useColors) {
        const color = LEVEL_COLORS[level];
        prefix = `${color}${BOLD}[${levelLabel}]${RESET}${DIM}[${name}]${RESET}`;
      } else {
        prefix = `[${levelLabel}][${name}]`;
      }

      const merged = { ...context };
      if (extra !== undefined) {
        if (level === 'error') {
          merged.error = formatError(extra);
        } else if (typeof extra === 'object' && extra !== null) {
          Object.assign(merged, extra as Record<string, unknown>);
        }
      }

      const hasData = Object.keys(merged).length > 0;
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      if (hasData) {
        fn(prefix, message, merged);
      } else {
        fn(prefix, message);
      }
    }
  } catch {
    // Logger must never throw
  }
}

/**
 * Create a named structured logger.
 *
 * Usage:
 *   const log = createLogger("dispatch");
 *   const trace = log.child({ traceId: "abc" });
 *   trace.info("Matched rules", { count: 3 });
 */
export function createLogger(name: string, baseContext?: Record<string, unknown>): Logger {
  const ctx = baseContext ?? {};

  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (shouldLog('debug')) emit('debug', name, message, ctx, data);
    },
    info(message: string, data?: Record<string, unknown>) {
      if (shouldLog('info')) emit('info', name, message, ctx, data);
    },
    warn(message: string, data?: Record<string, unknown>) {
      if (shouldLog('warn')) emit('warn', name, message, ctx, data);
    },
    error(message: string, error?: unknown) {
      if (shouldLog('error')) emit('error', name, message, ctx, error);
    },
    child(context: Record<string, unknown>): Logger {
      return createLogger(name, { ...ctx, ...context });
    },
  };
}
