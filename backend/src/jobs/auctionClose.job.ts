import { Queue, Worker, type Job } from 'bullmq';
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

export const scheduleAuctionClose = async (auctionId: string, endAt: Date) => {
  const delay = Math.max(0, endAt.getTime() - Date.now());
  await auctionCloseQueue.add(
    'close',
    { auctionId },
    { jobId: auctionId, delay, removeOnComplete: true, removeOnFail: 1000 },
  );
};

/** Lazily imported so the worker never loads (and never opens a blocking connection) in tests. */
export const startAuctionCloseWorker = () => {
  const worker = new Worker<AuctionCloseJobData>(
    AUCTION_CLOSE_QUEUE,
    async (job: Job<AuctionCloseJobData>) => {
      const { closeAuction } = await import('../services/auction.service');
      await closeAuction(job.data.auctionId);
    },
    { connection: redis.duplicate() },
  );
  worker.on('failed', (job, err) => {
    logger.error('auction-close job failed', { auctionId: job?.data.auctionId, err: String(err) });
  });
  return worker;
};
