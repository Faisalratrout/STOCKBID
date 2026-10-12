'use client';

import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/context/toast-context';
import { getSession } from '@/lib/auth-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

interface OutbidPayload {
  auctionId: string;
  newBid: string;
}

/**
 * One app-wide socket connection, live whenever a user is logged in, independent of whatever
 * page they're on, separate from useAuctionSocket's per-page connection. The backend
 * auto-joins every connected socket to its own user:<id> room (backend/src/sockets/index.ts),
 * so unlike useAuctionSocket there's no explicit room to watch, just a listener for bid:outbid.
 */
export const useOutbidNotifications = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    const token = getSession()?.accessToken;
    if (!user || !token) return;

    const socket: Socket = io(SOCKET_URL, { auth: { token } });
    socket.on('bid:outbid', (payload: OutbidPayload) => {
      showToast(`You've been outbid! New bid: $${payload.newBid}`, `/auctions/${payload.auctionId}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, showToast]);
};
