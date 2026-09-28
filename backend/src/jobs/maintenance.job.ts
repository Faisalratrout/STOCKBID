import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export const MAINTENANCE_QUEUE = 'maintenance';

const SWEEP_AUCTIONS = 'sweep-overdue-auctions';
const SWEEP_EVERY_MS = 2 * 60_000;

// Periodic safety nets. Job schedulers are upserted by id, so every API instance calling
// startMaintenance still produces one schedule per task, not one per instance.
export const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection: redis });

const run = async (job: Job) => {
  if (job.name === SWEEP_AUCTIONS) {
    const { sweepOverdueAuctions } = await import('../services/auction.service');
    return sweepOverdueAuctions();
  }
  logger.warn('Unknown maintenance job', { name: job.name });
};

/** Registers the repeating schedules, runs one auction sweep now, and starts the worker. */
export const startMaintenance = async () => {
  await maintenanceQueue.upsertJobScheduler(
    SWEEP_AUCTIONS,
    { every: SWEEP_EVERY_MS },
    { name: SWEEP_AUCTIONS, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );

  const worker = new Worker(MAINTENANCE_QUEUE, run, { connection: redis.duplicate() });
  worker.on('failed', (job, err) => {
    logger.error('maintenance job failed', { name: job?.name, err: String(err) });
  });

  // AUC-05: catch auctions whose close job was lost while the process was down.
  const { sweepOverdueAuctions } = await import('../services/auction.service');
  await sweepOverdueAuctions().catch((err: unknown) =>
    logger.error('startup auction sweep failed', { err: String(err) }),
  );
  return worker;
};
