import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Socket } from 'socket.io';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/tokens';
import { logger } from '../utils/logger';
import { initEmitter, auctionRoom, userRoom } from './emitter';
import { canWatchAuction } from '../services/auction.service';

/**
 * AUC-04: per-connection handlers. `auction:watch` acks `{ ok }`; it joins only the auction's
 * seller or a buyer who has bid on it, so other users never receive that auction's broadcasts.
 */
export const registerSocketHandlers = (socket: Socket) => {
  const userId = socket.data.user.id as string;
  void socket.join(userRoom(userId));

  socket.on('auction:watch', async (auctionId: unknown, ack?: unknown) => {
    let ok = false;
    if (typeof auctionId === 'string' && auctionId) {
      try {
        ok = await canWatchAuction(userId, auctionId);
        if (ok) await socket.join(auctionRoom(auctionId));
      } catch (err) {
        logger.warn('auction:watch failed', { auctionId, err: String(err) });
        ok = false;
      }
    }
    if (typeof ack === 'function') ack({ ok });
  });
  socket.on('auction:unwatch', (auctionId: unknown) => {
    if (typeof auctionId === 'string' && auctionId) void socket.leave(auctionRoom(auctionId));
  });
};

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

  io.on('connection', registerSocketHandlers);

  io.on('error', (err) => logger.error('Socket.io server error', { err: String(err) }));

  initEmitter(io);
  return io;
};
