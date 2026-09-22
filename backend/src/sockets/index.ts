import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/tokens';
import { logger } from '../utils/logger';
import { initEmitter, auctionRoom, userRoom } from './emitter';

/**
 * AUC-04: one Socket.io server per process, joined to the others via the Redis
 * pub/sub adapter so a bid placed on one instance reaches clients connected to
 * another. Auth is the same access token used for the REST API, passed in the
 * handshake (`auth.token`) since sockets have no Authorization header.
 */
export const initSockets = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN.split(','), credentials: true },
  });

  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const { sub, role } = verifyAccessToken(token);
      socket.data.user = { id: sub, role };
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user.id as string;
    socket.join(userRoom(userId));

    socket.on('auction:watch', (auctionId: unknown) => {
      if (typeof auctionId === 'string' && auctionId) socket.join(auctionRoom(auctionId));
    });
    socket.on('auction:unwatch', (auctionId: unknown) => {
      if (typeof auctionId === 'string' && auctionId) socket.leave(auctionRoom(auctionId));
    });
  });

  io.on('error', (err) => logger.error('Socket.io server error', { err: String(err) }));

  initEmitter(io);
  return io;
};
