'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getSession } from '@/lib/auth-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

/**
 * Joins the auction's socket room and calls onUpdate whenever the backend pushes a new bid
 * (`bid:new`), instead of polling the REST endpoints on a timer. Mirrors the protocol in
 * backend/src/sockets/index.ts exactly: the access token goes in the handshake (sockets have no
 * Authorization header), then `auction:watch`/`auction:unwatch` join/leave that auction's room.
 *
 * onUpdate is stashed in a ref rather than taken as an effect dependency: the caller passes a
 * new function literal every render, and including it directly would reconnect the socket on
 * every render instead of only when auctionId actually changes.
 */
export const useAuctionSocket = (auctionId: string | undefined, onUpdate: () => void) => {
  const onUpdateRef = useRef(onUpdate);
  // Keeping the ref current has to happen in an effect, not directly in the render body: render
  // must stay a pure computation, and mutating a ref there is exactly the kind of side effect
  // React warns against (it can run more than once per commit under StrictMode/concurrent
  // rendering).
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    const token = getSession()?.accessToken;
    if (!auctionId || !token) return;

    const socket: Socket = io(SOCKET_URL, { auth: { token } });
    socket.emit('auction:watch', auctionId);
    socket.on('bid:new', () => onUpdateRef.current());

    return () => {
      socket.emit('auction:unwatch', auctionId);
      socket.disconnect();
    };
  }, [auctionId]);
};
