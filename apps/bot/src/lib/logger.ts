const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof levels;

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

function serialize(data: Record<string, unknown>) {
  return JSON.stringify(data, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
  );
}

/** One line per event: `time level message {json}`. Swap for pino once we ship logs somewhere. */
export function createLogger(minLevel: LogLevel = "info"): Logger {
  const log = (level: LogLevel) => (msg: string, data?: Record<string, unknown>) => {
    if (levels[level] < levels[minLevel]) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`;
    const out = data ? `${line} ${serialize(data)}` : line;
    (level === "error" || level === "warn" ? console.error : console.log)(out);
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}
