import IORedis from 'ioredis';
import { env } from './env';

/**
 * Shared Redis connection for BullMQ. `maxRetriesPerRequest: null` is required by BullMQ.
 * Connection is lazy so importing this module never blocks app startup or tests.
 */
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
