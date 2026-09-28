import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export const MAINTENANCE_QUEUE = 'maintenance';

export const SWEEP_AUCTIONS = 'sweep-overdue-auctions';
export const EXPIRE_OFFERS = 'expire-stale-offers';

const SCHEDULES: Record<string, number> = {
  [SWEEP_AUCTIONS]: 2 * 60_000,
  [EXPIRE_OFFERS]: 15 * 60_000,
};

// Periodic safety nets. Job schedulers are upserted by id, so every API instance calling
// startMaintenance still produces one schedule per task, not one per instance.
export const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection: redis });

/** Worker processor, exported so tests can run a job without a worker or Redis round-trip. */
export const runMaintenanceJob = async (job: Pick<Job, 'name'>): Promise<number | undefined> => {
  switch (job.name) {
    case SWEEP_AUCTIONS: {
      const { sweepOverdueAuctions } = await import('../services/auction.service');
      return sweepOverdueAuctions();
    }
    case EXPIRE_OFFERS: {
      const { expireStaleOffers } = await import('../services/offer.service');
      return expireStaleOffers();
    }
    default:
      logger.warn('Unknown maintenance job', { name: job.name });
      return undefined;
  }
};

/** Registers the repeating schedules, runs one auction sweep now, and starts the worker. */
export const startMaintenance = async () => {
  for (const [name, every] of Object.entries(SCHEDULES)) {
    await maintenanceQueue.upsertJobScheduler(
      name,
      { every },
      { name, opts: { removeOnComplete: true, removeOnFail: 100 } },
    );
  }

  const worker = new Worker(MAINTENANCE_QUEUE, runMaintenanceJob, {
    connection: redis.duplicate(),
  });
  worker.on('failed', (job, err) => {
    logger.error('maintenance job failed', { name: job?.name, err: String(err) });
  });

  // AUC-05: catch auctions whose close job was lost while the process was down.
  await runMaintenanceJob({ name: SWEEP_AUCTIONS }).catch((err: unknown) =>
    logger.error('startup auction sweep failed', { err: String(err) }),
  );
  return worker;
};
