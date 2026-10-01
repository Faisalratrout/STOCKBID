import { DelayedError, Queue, Worker, type Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export const AUCTION_CLOSE_QUEUE = 'auction-close';

interface AuctionCloseJobData {
  auctionId: string;
}

// AUC-05: one delayed job per auction, jobId = auctionId so scheduling twice is a no-op.
// The worker's connection is a duplicate of the shared client: BullMQ's blocking commands
// (used by the Worker) cannot share a connection with ordinary (Queue-side) commands.
export const auctionCloseQueue = new Queue<AuctionCloseJobData>(AUCTION_CLOSE_QUEUE, {
  connection: redis,
});

// Retries cover transient DB failures. A job that still fails keeps its jobId, so re-adding it
// is a no-op: the maintenance sweep (sweepOverdueAuctions) is what recovers those.
export const scheduleAuctionClose = async (auctionId: string, endAt: Date) => {
  const delay = Math.max(0, endAt.getTime() - Date.now());
  await auctionCloseQueue.add(
    'close',
    { auctionId },
    {
      jobId: auctionId,
      delay,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    },
  );
};

/**
 * AUC-05: closes the auction, or moves this job back to its endAt if it fired early. Re-adding
 * the job would be a no-op (same jobId, still active), so it is delayed in place instead.
 */
export const processAuctionCloseJob = async (job: Job<AuctionCloseJobData>, token?: string) => {
  const { closeAuction } = await import('../services/auction.service');
  const { dueAt } = await closeAuction(job.data.auctionId);
  if (dueAt) {
    await job.moveToDelayed(dueAt.getTime(), token);
    throw new DelayedError();
  }
};

/** Lazily imported so the worker never loads (and never opens a blocking connection) in tests. */
export const startAuctionCloseWorker = () => {
  const worker = new Worker<AuctionCloseJobData>(AUCTION_CLOSE_QUEUE, processAuctionCloseJob, {
    connection: redis.duplicate(),
  });
  worker.on('failed', (job, err) => {
    logger.error('auction-close job failed', {
      auctionId: job?.data.auctionId,
      attempt: job?.attemptsMade,
      err: String(err),
    });
  });
  return worker;
};
