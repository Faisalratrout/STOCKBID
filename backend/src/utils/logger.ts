type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const min: Level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
const silent = process.env.NODE_ENV === 'test';

const write = (level: Level, msg: string, meta?: unknown) => {
  if (silent || order[level] < order[min]) return;
  const line = { level, time: new Date().toISOString(), msg, ...(meta ? { meta } : {}) };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
};

export const logger = {
  debug: (msg: string, meta?: unknown) => write('debug', msg, meta),
  info: (msg: string, meta?: unknown) => write('info', msg, meta),
  warn: (msg: string, meta?: unknown) => write('warn', msg, meta),
  error: (msg: string, meta?: unknown) => write('error', msg, meta),
};
