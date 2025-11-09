import { env } from "./env.mjs";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMetadata = Record<string, unknown>;
type LogArgs = [string] | [LogMetadata, string?];

function emitLog(
  level: LogLevel,
  bindings: LogMetadata,
  ...args: LogArgs
) {
  const consoleMethod =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;

  let message = "";
  let metadata: LogMetadata | undefined;

  if (typeof args[0] === "string") {
    message = args[0];
    metadata = bindings;
  } else {
    const [meta, maybeMessage] = args;
    message = maybeMessage ?? "";
    metadata = { ...bindings, ...meta };
  }

  const payload =
    metadata && Object.keys(metadata).length > 0 ? metadata : undefined;

  if (payload) {
    consoleMethod(`[${level}] ${message}`, payload);
  } else {
    consoleMethod(`[${level}] ${message}`);
  }
}

function createBaseLogger(bindings: LogMetadata = {}) {
  return {
    debug: (...args: LogArgs) => emitLog("debug", bindings, ...args),
    info: (...args: LogArgs) => emitLog("info", bindings, ...args),
    warn: (...args: LogArgs) => emitLog("warn", bindings, ...args),
    error: (...args: LogArgs) => emitLog("error", bindings, ...args),
    child(childBindings: LogMetadata) {
      return createBaseLogger({ ...bindings, ...childBindings });
    },
  };
}

/**
 * Structured logger with simple console-based transport.
 * Includes environment metadata so logs can be filtered downstream.
 */
export const logger = createBaseLogger({ env: env.NODE_ENV });

export function createLogger(bindings: LogMetadata) {
  return logger.child(bindings);
}

export function logTiming(operation: string) {
  const start = Date.now();
  return (metadata?: LogMetadata) => {
    const duration = Date.now() - start;
    logger.info(
      {
        operation,
        duration,
        ...metadata,
      },
      `${operation} completed in ${duration}ms`
    );
  };
}

export function logAndThrow(
  error: Error,
  context?: LogMetadata
): never {
  logger.error({ err: error, ...context }, error.message);
  throw error;
}
