/**
 * Minimal structured JSON logger (one JSON object per line).
 *
 * Used by the hiring module for observability: every entry carries a
 * timestamp, level, event name and arbitrary context fields, so logs can be
 * shipped to any log aggregator and queried by field.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function serializeError(err: unknown): LogContext {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message };
  }
  return { errorMessage: String(err) };
}

function write(level: LogLevel, event: string, context: LogContext = {}) {
  const { error, ...rest } = context;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...rest,
    ...(error !== undefined ? serializeError(error) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (event: string, context?: LogContext) => {
    if (process.env.NODE_ENV !== "test") write("debug", event, context);
  },
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
};

export default logger;
