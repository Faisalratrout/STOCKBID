import type { Server as SocketIOServer } from 'socket.io';

// AUC-04: services call these directly instead of importing socket.io, so they stay
// testable with plain supertest (no server listening) — before init() runs, every
// emit is a silent no-op instead of a crash.
let io: SocketIOServer | undefined;

export const initEmitter = (server: SocketIOServer) => {
  io = server;
};

const auctionRoom = (auctionId: string) => `auction:${auctionId}`;
const userRoom = (userId: string) => `user:${userId}`;

export const emitNewBid = (auctionId: string, payload: unknown) => {
  io?.to(auctionRoom(auctionId)).emit('bid:new', payload);
};

export const emitOutbid = (userId: string, payload: unknown) => {
  io?.to(userRoom(userId)).emit('bid:outbid', payload);
};

export const emitAuctionEnded = (auctionId: string, payload: unknown) => {
  io?.to(auctionRoom(auctionId)).emit('auction:ended', payload);
};

export const emitToUser = (userId: string, event: string, payload: unknown) => {
  io?.to(userRoom(userId)).emit(event, payload);
};

export { auctionRoom, userRoom };
