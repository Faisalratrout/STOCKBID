import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/db';
import { logger } from './utils/logger';

const app = createApp();
const server = http.createServer(app);

// Socket.io and the BullMQ worker attach here (see sockets/ and jobs/).

server.listen(env.PORT, () => {
  logger.info(`STOCKBID API listening on :${env.PORT}`, { env: env.NODE_ENV });
});

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
