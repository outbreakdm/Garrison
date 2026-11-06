const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof levels;

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const SECRET_KEY = /token|secret|password|authorization|cookie|api[-_]?key|database_url/i;
// Discord bot tokens and Postgres URLs with credentials, wherever they appear in a string.
const SECRET_VALUE = /[\w-]{24,}\.[\w-]{6,}\.[\w-]{27,}|postgres(?:ql)?:\/\/[^\s"']+/g;

/** JSON-encode log data with secrets removed, by key name and by shape. */
export function serialize(data: Record<string, unknown>) {
  return JSON.stringify(data, (key, v) => {
    if (key && SECRET_KEY.test(key)) return "[redacted]";
    if (v instanceof Error)
      return { name: v.name, message: redact(v.message), stack: redact(v.stack ?? "") };
    if (typeof v === "string") return redact(v);
    if (typeof v === "bigint") return v.toString();
    return v;
  });
}

const redact = (s: string) => s.replace(SECRET_VALUE, "[redacted]");

/** One line per event: `time level message {json}`. Swap for pino once we ship logs somewhere. */
export function createLogger(minLevel: LogLevel = "info"): Logger {
  const log = (level: LogLevel) => (msg: string, data?: Record<string, unknown>) => {
    if (levels[level] < levels[minLevel]) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${redact(msg)}`;
    const out = data ? `${line} ${serialize(data)}` : line;
    (level === "error" || level === "warn" ? console.error : console.log)(out);
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}
