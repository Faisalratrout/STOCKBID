import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/db';
import { logger } from './utils/logger';
import { initSockets } from './sockets';
import { startAuctionCloseWorker } from './jobs/auctionClose.job';

const app = createApp();
const server = http.createServer(app);
initSockets(server);
const auctionCloseWorker = startAuctionCloseWorker();

server.listen(env.PORT, () => {
  logger.info(`STOCKBID API listening on :${env.PORT}`, { env: env.NODE_ENV });
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await auctionCloseWorker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
